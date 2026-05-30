from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class System(db.Model):
    """Represents a discovered star system"""
    __tablename__ = 'systems'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False, index=True)
    x = db.Column(db.Float, nullable=False)
    y = db.Column(db.Float, nullable=False)
    z = db.Column(db.Float, nullable=False)
    
    # System details
    galaxy_address = db.Column(db.String(255))
    system_type = db.Column(db.String(100))
    star_type = db.Column(db.String(100))
    planets_count = db.Column(db.Integer)
    
    # Metadata
    discovered_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    notes = db.Column(db.Text)
    
    # Relationships
    journal_entries = db.relationship('JournalEntry', backref='system', lazy=True, cascade='all, delete-orphan')
    images = db.relationship(
        'SystemImage',
        back_populates='system',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='desc(SystemImage.uploaded_at)'
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'z': self.z,
            'galaxy_address': self.galaxy_address,
            'system_type': self.system_type,
            'star_type': self.star_type,
            'planets_count': self.planets_count,
            'discovered_at': self.discovered_at.isoformat(),
            'notes': self.notes
        }
    
    def __repr__(self):
        return f'<System {self.name}>'

class SystemImage(db.Model):
    """Image uploaded for a discovered star system"""
    __tablename__ = 'system_images'

    id = db.Column(db.Integer, primary_key=True)
    system_id = db.Column(db.Integer, db.ForeignKey('systems.id'), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255))
    caption = db.Column(db.String(255))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    system = db.relationship('System', back_populates='images')

    def __repr__(self):
        return f'<SystemImage {self.filename}>'

class JournalEntry(db.Model):
    """Represents a journal entry for a system or general adventure"""
    __tablename__ = 'journal_entries'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Optional: Link to a specific system
    system_id = db.Column(db.Integer, db.ForeignKey('systems.id'), nullable=True)
    
    # Tags/categories for organization
    tags = db.Column(db.String(255))
    
    def get_tags(self):
        """Parse tags from comma-separated string"""
        return [tag.strip() for tag in self.tags.split(',')] if self.tags else []
    
    def set_tags(self, tags_list):
        """Set tags from list"""
        self.tags = ','.join(tags_list) if tags_list else ''
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'system_id': self.system_id,
            'system_name': self.system.name if self.system else None,
            'tags': self.get_tags()
        }
    
    def __repr__(self):
        return f'<JournalEntry {self.title}>'

def init_db(app):
    """Initialize database"""
    with app.app_context():
        db.create_all()
