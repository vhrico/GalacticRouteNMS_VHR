# Galactic Route NMS - VHR

A Flask web application that tracks your journey through the No Man's Sky Galaxy. Visualize your explored systems and keep journal entries of your adventures.

## Features

- **Galaxy Map**: Interactive visualization of explored systems
- **Game Save Integration**: Import systems from No Man's Sky game save files
- **Journal Entries**: Document your journey with short entry logs
- **System Tracking**: View detailed information about discovered systems

## Getting Started

### Prerequisites

- Python 3.9+
- Flask
- SQLite3 (included with Python)

### Installation

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the application:
   ```bash
   python app.py
   ```
5. Open your browser to `http://localhost:5000`

## Project Structure

```
.
├── app.py                 # Flask application entry point
├── requirements.txt       # Python dependencies
├── config.py             # Configuration settings
├── database.py           # Database initialization and models
├── save_parser.py        # No Man's Sky save file parser
├── static/
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       └── map.js        # Galaxy map rendering
└── templates/
    ├── base.html         # Base template
    ├── index.html        # Home page with galaxy map
    ├── upload.html       # Save file upload
    └── journal.html      # Journal entries view
```

## License

GNU General Public License v3.0
