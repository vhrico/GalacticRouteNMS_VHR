from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, send_from_directory, abort
from werkzeug.utils import secure_filename
import os
import base64
import binascii
from datetime import datetime
from uuid import uuid4

from config import DevelopmentConfig
from database import db, System, SystemImage, JournalEntry, init_db
from save_parser import SaveFileParser

app = Flask(__name__)
app.config.from_object(DevelopmentConfig)

# Initialize database
db.init_app(app)
init_db(app)

# Create upload folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

IMAGE_UPLOAD_FOLDER = os.path.join(app.config['UPLOAD_FOLDER'], 'system_images')
MAP_SNAPSHOT_FOLDER = os.path.join(app.config['UPLOAD_FOLDER'], 'map_snapshots')
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

os.makedirs(IMAGE_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(MAP_SNAPSHOT_FOLDER, exist_ok=True)


def allowed_image_file(filename):
    """Return True when the filename has a supported image extension."""
    return (
        filename
        and '.' in filename
        and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS
    )


def unique_upload_name(filename):
    """Build a stable, collision-resistant upload filename."""
    safe_name = secure_filename(filename)
    stem, ext = os.path.splitext(safe_name)
    stem = stem[:60] or 'image'
    return f'{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{uuid4().hex[:10]}-{stem}{ext.lower()}'


def save_system_image(file):
    """Save an uploaded system image and return its stored filename."""
    if not file or file.filename == '':
        return None
    if not allowed_image_file(file.filename):
        raise ValueError('Image must be a PNG, JPG, GIF, or WebP file.')

    filename = unique_upload_name(file.filename)
    file.save(os.path.join(IMAGE_UPLOAD_FOLDER, filename))
    return filename


def get_map_snapshots(limit=6):
    """Return recent saved map snapshots for display on the map page."""
    snapshots = []
    if not os.path.isdir(MAP_SNAPSHOT_FOLDER):
        return snapshots

    for filename in os.listdir(MAP_SNAPSHOT_FOLDER):
        if not allowed_image_file(filename):
            continue
        path = os.path.join(MAP_SNAPSHOT_FOLDER, filename)
        snapshots.append({
            'filename': filename,
            'created_at': datetime.fromtimestamp(os.path.getmtime(path))
        })

    return sorted(snapshots, key=lambda item: item['created_at'], reverse=True)[:limit]


def system_color(system):
    """Map known star/system types to a Three.js-friendly numeric color."""
    details = f'{system.system_type or ""} {system.star_type or ""}'.lower()
    if 'red' in details or 'm' == (system.star_type or '').strip().lower():
        return 0xff5f57
    if 'blue' in details or (system.star_type or '').strip().lower() in {'o', 'b'}:
        return 0x67a8ff
    if 'green' in details:
        return 0x7dff9a
    if 'binary' in details or 'exotic' in details:
        return 0xb58cff
    if 'white' in details or (system.star_type or '').strip().lower() == 'a':
        return 0xf3f7ff
    return 0xffd166


def system_to_galaxy_object(system):
    """Convert a stored System row into the object shape expected by galaxy.html."""
    return {
        'id': system.id,
        'name': system.name,
        'type': 'system',
        'x': system.x,
        'y': system.y,
        'z': system.z,
        'color': system_color(system),
        'system_type': system.system_type or '',
        'star_type': system.star_type or '',
        'planets_count': system.planets_count,
        'galaxy_address': system.galaxy_address or '',
        'notes': system.notes or ''
    }


def import_systems(systems_data):
    """Insert new systems and update existing systems by name."""
    added_count = 0
    updated_count = 0

    for sys_data in systems_data:
        if not sys_data.get('name'):
            continue

        existing = System.query.filter_by(name=sys_data['name']).first()
        if existing:
            for field in ('x', 'y', 'z', 'galaxy_address', 'system_type', 'star_type', 'planets_count', 'notes'):
                if field in sys_data:
                    setattr(existing, field, sys_data[field])
            updated_count += 1
        else:
            db.session.add(System(**sys_data))
            added_count += 1

    return added_count, updated_count

# ==================== Routes ====================

@app.route('/')
@app.route('/galaxy')
def index():
    """Main 3D galaxy render."""
    systems = System.query.order_by(System.discovered_at.asc()).all()
    galaxy_objects = [system_to_galaxy_object(system) for system in systems]
    return render_template(
        'galaxy.html',
        systems=systems,
        galaxy_objects=galaxy_objects
    )

@app.route('/api/systems')
def api_get_systems():
    """API endpoint to get all systems as JSON"""
    systems = System.query.all()
    return jsonify([system.to_dict() for system in systems])

@app.route('/api/galaxy-objects')
def api_get_galaxy_objects():
    """API endpoint for the object shape consumed by the 3D galaxy render."""
    systems = System.query.order_by(System.discovered_at.asc()).all()
    return jsonify([system_to_galaxy_object(system) for system in systems])

@app.route('/system/<int:system_id>')
def view_system(system_id):
    """View details for a specific system"""
    system = System.query.get_or_404(system_id)
    entries = JournalEntry.query.filter_by(system_id=system_id).order_by(JournalEntry.created_at.desc()).all()
    return render_template('system.html', system=system, entries=entries)

@app.route('/system/add', methods=['GET', 'POST'])
def add_system():
    """Add a system manually"""
    if request.method == 'POST':
        try:
            system = System(
                name=request.form.get('name'),
                x=float(request.form.get('x', 0)),
                y=float(request.form.get('y', 0)),
                z=float(request.form.get('z', 0)),
                galaxy_address=request.form.get('galaxy_address', ''),
                system_type=request.form.get('system_type', ''),
                star_type=request.form.get('star_type', ''),
                planets_count=int(request.form.get('planets_count', 0)) or None,
                notes=request.form.get('notes', '')
            )
            db.session.add(system)
            db.session.flush()

            image_filename = save_system_image(request.files.get('image'))
            if image_filename:
                db.session.add(SystemImage(
                    system_id=system.id,
                    filename=image_filename,
                    original_filename=secure_filename(request.files['image'].filename),
                    caption=request.form.get('image_caption', '').strip()
                ))

            db.session.commit()
            flash(f'System {system.name} added successfully!', 'success')
            return redirect(url_for('view_system', system_id=system.id))
        except Exception as e:
            db.session.rollback()
            flash(f'Error adding system: {str(e)}', 'error')
            return redirect(url_for('add_system'))
    
    return render_template('add_system.html')

@app.route('/system/<int:system_id>/images', methods=['POST'])
def upload_system_image(system_id):
    """Upload an image for an existing system"""
    system = System.query.get_or_404(system_id)

    try:
        image_filename = save_system_image(request.files.get('image'))
        if not image_filename:
            flash('Choose an image before uploading.', 'error')
            return redirect(url_for('view_system', system_id=system.id))

        db.session.add(SystemImage(
            system_id=system.id,
            filename=image_filename,
            original_filename=secure_filename(request.files['image'].filename),
            caption=request.form.get('caption', '').strip()
        ))
        db.session.commit()
        flash('Image uploaded successfully.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error uploading image: {str(e)}', 'error')

    return redirect(url_for('view_system', system_id=system.id))

@app.route('/uploads/system-images/<path:filename>')
def uploaded_system_image(filename):
    """Serve system images from the local upload folder."""
    if not allowed_image_file(filename):
        abort(404)
    return send_from_directory(IMAGE_UPLOAD_FOLDER, filename)

@app.route('/uploads/map-snapshots/<path:filename>')
def uploaded_map_snapshot(filename):
    """Serve saved 3D map snapshots from the local upload folder."""
    if not allowed_image_file(filename):
        abort(404)
    return send_from_directory(MAP_SNAPSHOT_FOLDER, filename)

@app.route('/api/map-snapshots', methods=['POST'])
def api_create_map_snapshot():
    """Save the current 3D canvas view as a PNG snapshot."""
    data = request.get_json(silent=True) or {}
    image_data = data.get('image', '')
    prefix = 'data:image/png;base64,'

    if not image_data.startswith(prefix):
        return jsonify({'error': 'Snapshot must be a PNG data URL.'}), 400

    try:
        png_bytes = base64.b64decode(image_data[len(prefix):], validate=True)
    except (binascii.Error, ValueError):
        return jsonify({'error': 'Snapshot data could not be decoded.'}), 400

    if not png_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return jsonify({'error': 'Snapshot data is not a valid PNG.'}), 400

    filename = f'map-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{uuid4().hex[:10]}.png'
    filepath = os.path.join(MAP_SNAPSHOT_FOLDER, filename)
    with open(filepath, 'wb') as snapshot:
        snapshot.write(png_bytes)

    return jsonify({
        'filename': filename,
        'url': url_for('uploaded_map_snapshot', filename=filename)
    }), 201

@app.route('/upload', methods=['GET', 'POST'])
def upload_save():
    """Upload and parse a No Man's Sky save file"""
    if request.method == 'GET':
        return redirect(url_for('index'))

    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file provided', 'error')
            return redirect(url_for('index'))
        
        file = request.files['file']
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(url_for('index'))
        
        try:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Parse the save file
            parser = SaveFileParser(filepath)
            parser.parse()
            systems_data = parser.extract_systems()
            
            added_count, updated_count = import_systems(systems_data)
            db.session.commit()

            if added_count or updated_count:
                flash(f'Imported {added_count} new systems and updated {updated_count} existing systems.', 'success')
            else:
                flash('No systems were found in that save file.', 'warning')
            return redirect(url_for('index'))
        except Exception as e:
            db.session.rollback()
            flash(f'Error processing save file: {str(e)}', 'error')
            return redirect(url_for('index'))

@app.route('/journal')
def view_journal():
    """View all journal entries"""
    page = request.args.get('page', 1, type=int)
    entries = JournalEntry.query.order_by(JournalEntry.created_at.desc()).paginate(page=page, per_page=10)
    return render_template('journal.html', entries=entries)

@app.route('/journal/add', methods=['GET', 'POST'])
def add_entry():
    """Add a new journal entry"""
    if request.method == 'POST':
        try:
            system_id = request.form.get('system_id')
            entry = JournalEntry(
                title=request.form.get('title'),
                content=request.form.get('content'),
                system_id=int(system_id) if system_id else None,
                tags=request.form.get('tags', '')
            )
            db.session.add(entry)
            db.session.commit()
            flash('Journal entry added successfully!', 'success')
            return redirect(url_for('view_journal'))
        except Exception as e:
            flash(f'Error adding journal entry: {str(e)}', 'error')
            return redirect(url_for('add_entry'))
    
    systems = System.query.all()
    return render_template('add_entry.html', systems=systems)

@app.route('/journal/<int:entry_id>/edit', methods=['GET', 'POST'])
def edit_entry(entry_id):
    """Edit a journal entry"""
    entry = JournalEntry.query.get_or_404(entry_id)
    
    if request.method == 'POST':
        try:
            entry.title = request.form.get('title')
            entry.content = request.form.get('content')
            entry.tags = request.form.get('tags', '')
            entry.updated_at = datetime.utcnow()
            
            system_id = request.form.get('system_id')
            entry.system_id = int(system_id) if system_id else None
            
            db.session.commit()
            flash('Journal entry updated!', 'success')
            return redirect(url_for('view_journal'))
        except Exception as e:
            flash(f'Error updating entry: {str(e)}', 'error')
    
    systems = System.query.all()
    return render_template('edit_entry.html', entry=entry, systems=systems)

@app.route('/stats')
def stats():
    """View statistics"""
    total_systems = System.query.count()
    total_entries = JournalEntry.query.count()
    recent_systems = System.query.order_by(System.discovered_at.desc()).limit(5).all()
    recent_entries = JournalEntry.query.order_by(JournalEntry.created_at.desc()).limit(5).all()
    
    return render_template('stats.html', 
                         total_systems=total_systems,
                         total_entries=total_entries,
                         recent_systems=recent_systems,
                         recent_entries=recent_entries)

# ==================== Error Handlers ====================

@app.errorhandler(404)
def not_found(error):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(error):
    return render_template('500.html'), 500

# ==================== CLI Commands ====================

@app.cli.command()
def reset_db():
    """Reset the database"""
    db.drop_all()
    db.create_all()
    print('Database reset!')

@app.cli.command()
def seed_db():
    """Seed database with sample data"""
    sample_systems = [
        System(name='Sol', x=0, y=0, z=0, system_type='Yellow Star', star_type='G', planets_count=8),
        System(name='Alpha Centauri', x=1.3, y=0, z=0, system_type='Binary', star_type='G', planets_count=3),
        System(name='Sirius', x=2.6, y=0, z=0, system_type='Yellow Star', star_type='A', planets_count=2),
    ]
    for system in sample_systems:
        db.session.add(system)
    db.session.commit()
    print('Database seeded with sample data!')

if __name__ == '__main__':
    app.run(debug=True)
