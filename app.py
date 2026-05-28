from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from werkzeug.utils import secure_filename
import os
from datetime import datetime

from config import DevelopmentConfig
from database import db, System, JournalEntry, init_db
from save_parser import SaveFileParser

app = Flask(__name__)
app.config.from_object(DevelopmentConfig)

# Initialize database
db.init_app(app)
init_db(app)

# Create upload folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ==================== Routes ====================

@app.route('/')
def index():
    """Home page with galaxy map"""
    systems = System.query.all()
    return render_template('index.html', systems=systems)

@app.route('/api/systems')
def api_get_systems():
    """API endpoint to get all systems as JSON"""
    systems = System.query.all()
    return jsonify([system.to_dict() for system in systems])

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
            db.session.commit()
            flash(f'System {system.name} added successfully!', 'success')
            return redirect(url_for('view_system', system_id=system.id))
        except Exception as e:
            flash(f'Error adding system: {str(e)}', 'error')
            return redirect(url_for('add_system'))
    
    return render_template('add_system.html')

@app.route('/upload', methods=['GET', 'POST'])
def upload_save():
    """Upload and parse a No Man's Sky save file"""
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file provided', 'error')
            return redirect(request.url)
        
        file = request.files['file']
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(request.url)
        
        try:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            # Parse the save file
            parser = SaveFileParser(filepath)
            parser.parse()
            systems_data = parser.extract_systems()
            
            # Add systems to database
            added_count = 0
            for sys_data in systems_data:
                try:
                    existing = System.query.filter_by(name=sys_data['name']).first()
                    if not existing:
                        system = System(**sys_data)
                        db.session.add(system)
                        added_count += 1
                except Exception as e:
                    print(f"Error adding system {sys_data.get('name')}: {str(e)}")
            
            db.session.commit()
            flash(f'Successfully imported {added_count} new systems!', 'success')
            return redirect(url_for('index'))
        except Exception as e:
            flash(f'Error processing save file: {str(e)}', 'error')
            return redirect(request.url)
    
    return render_template('upload.html')

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
