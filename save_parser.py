"""Parser helpers for importing star-system data from save-like files."""
import json
from pathlib import Path


class SaveFileParser:
    """
    Extracts system records from JSON save exports or files that contain JSON
    inside other bytes/text. The parser is intentionally tolerant because save
    export formats vary a lot between tools.
    """

    SYSTEM_COLLECTION_KEYS = {
        'VisitedSystems',
        'visitedSystems',
        'visited_systems',
        'Systems',
        'systems',
        'CelestialObjects',
        'celestial_objects',
        'GalacticObjects',
        'galactic_objects'
    }

    NAME_KEYS = ('name', 'Name', 'SystemName', 'systemName', 'system_name', 'DisplayName')
    ADDRESS_KEYS = ('Address', 'address', 'GalaxyAddress', 'galaxy_address', 'PortalAddress')
    TYPE_KEYS = ('Type', 'type', 'SystemType', 'system_type')
    STAR_TYPE_KEYS = ('StarType', 'star_type', 'starType', 'StarClass', 'star_class')
    PLANET_KEYS = ('PlanetCount', 'planet_count', 'planets_count', 'Planets', 'planets')

    X_KEYS = ('x', 'X', 'VoxelX', 'voxelX', 'galacticX', 'GalacticX', 'PositionX', 'positionX')
    Y_KEYS = ('y', 'Y', 'VoxelY', 'voxelY', 'galacticY', 'GalacticY', 'PositionY', 'positionY')
    Z_KEYS = ('z', 'Z', 'VoxelZ', 'voxelZ', 'galacticZ', 'GalacticZ', 'PositionZ', 'positionZ')

    POSITION_KEYS = ('position', 'Position', 'coords', 'Coords', 'coordinates', 'Coordinates')
    ADDRESS_OBJECT_KEYS = ('UniverseAddress', 'universeAddress', 'GalacticAddress', 'galacticAddress')

    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.data = None
        self._systems = []

    def parse(self):
        """Parse the file and cache extracted systems."""
        content = self.file_path.read_bytes()
        text = content.decode('utf-8-sig', errors='ignore')

        parsed_values = self._parse_json_candidates(text)
        if not parsed_values:
            raise ValueError('No JSON-like save data found in file.')

        for value in parsed_values:
            systems = self._extract_systems_from_any(value)
            if systems:
                self.data = value
                self._systems = systems
                return self.data

        self.data = parsed_values[0]
        self._systems = []
        return self.data

    def _parse_json_candidates(self, text):
        """Return JSON values found in the text, strongest candidates first."""
        candidates = []

        stripped = text.strip()
        if stripped:
            try:
                candidates.append(json.loads(stripped))
                return candidates
            except json.JSONDecodeError:
                pass

        decoder = json.JSONDecoder()
        starts = [idx for idx, char in enumerate(text) if char in '{[']

        for start in starts[:5000]:
            try:
                value, end = decoder.raw_decode(text[start:])
            except json.JSONDecodeError:
                continue

            size = end
            candidates.append((size, value))

            systems = self._extract_systems_from_any(value)
            if systems:
                return [value]

        candidates.sort(key=lambda item: item[0], reverse=True)
        return [value for _, value in candidates[:10]]

    def extract_systems(self):
        """Return normalized system dictionaries ready for the database model."""
        if self.data is None:
            raise ValueError('Save file not parsed yet. Call parse() first.')
        return self._systems

    def _extract_systems_from_any(self, value):
        found = []
        seen = set()

        def visit(node):
            if isinstance(node, list):
                for item in node:
                    visit(item)
                return

            if not isinstance(node, dict):
                return

            parsed = self._parse_system(node)
            if parsed:
                key = (parsed['name'].lower(), parsed['x'], parsed['y'], parsed['z'])
                if key not in seen:
                    seen.add(key)
                    found.append(parsed)

            for key, child in node.items():
                if key in self.SYSTEM_COLLECTION_KEYS:
                    visit(child)
                elif isinstance(child, (dict, list)):
                    visit(child)

        visit(value)
        return found

    def _parse_system(self, data):
        coords = self._extract_coords(data)
        if coords is None:
            return None

        name = self._first_value(data, self.NAME_KEYS)
        address = self._first_value(data, self.ADDRESS_KEYS) or ''

        if not name and address:
            name = f'System {address}'
        if not name:
            return None

        planets_count = self._first_value(data, self.PLANET_KEYS)
        if isinstance(planets_count, list):
            planets_count = len(planets_count)
        planets_count = self._safe_int(planets_count)

        return {
            'name': str(name).strip()[:255] or 'Unknown System',
            'x': coords[0],
            'y': coords[1],
            'z': coords[2],
            'galaxy_address': str(address).strip()[:255],
            'system_type': str(self._first_value(data, self.TYPE_KEYS) or '').strip()[:100],
            'star_type': str(self._first_value(data, self.STAR_TYPE_KEYS) or '').strip()[:100],
            'planets_count': planets_count,
            'notes': ''
        }

    def _extract_coords(self, data):
        direct = (
            self._first_value(data, self.X_KEYS),
            self._first_value(data, self.Y_KEYS),
            self._first_value(data, self.Z_KEYS)
        )
        coords = self._coerce_coords(direct)
        if coords is not None:
            return coords

        for key in self.POSITION_KEYS:
            coords = self._coerce_coords(data.get(key))
            if coords is not None:
                return coords

        for key in self.ADDRESS_OBJECT_KEYS:
            value = data.get(key)
            if isinstance(value, dict):
                coords = self._coerce_coords((
                    self._first_value(value, self.X_KEYS),
                    self._first_value(value, self.Y_KEYS),
                    self._first_value(value, self.Z_KEYS)
                ))
                if coords is not None:
                    return coords

        return None

    def _coerce_coords(self, value):
        if isinstance(value, dict):
            value = (
                self._first_value(value, self.X_KEYS),
                self._first_value(value, self.Y_KEYS),
                self._first_value(value, self.Z_KEYS)
            )

        if not isinstance(value, (list, tuple)) or len(value) < 3:
            return None

        coords = [self._safe_float(value[0]), self._safe_float(value[1]), self._safe_float(value[2])]
        if any(coord is None for coord in coords):
            return None
        return tuple(coords)

    def _first_value(self, data, keys):
        for key in keys:
            if key in data and data[key] not in (None, ''):
                return data[key]
        return None

    def _safe_float(self, value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _safe_int(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
