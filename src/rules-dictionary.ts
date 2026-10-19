// Keyword lists for the rule-based breakdown, in English and Spanish.
// Terms are lowercase singular forms; a plural "s"/"es" ending is matched automatically.
// An entry with a `label` always produces that element name (concepts such as "Fight");
// without one, the element is named after the term found in the script ("Lantern", "Linterna").
// Words that are ambiguous across languages (Spanish "van", "sobre", "nada") are left out on purpose.

export interface DictEntry {
  label?: string;
  terms: string[];
}

export const CATEGORY_TERMS: Record<string, DictEntry[]> = {
  vehicles: [
    {
      terms: [
        'car', 'police car', 'truck', 'bus', 'taxi', 'cab', 'motorcycle', 'motorbike', 'bicycle', 'bike', 'scooter',
        'boat', 'fishing boat', 'rowboat', 'ship', 'ferry', 'yacht', 'canoe', 'helicopter', 'plane', 'airplane',
        'ambulance', 'tractor', 'train', 'jeep', 'pickup', 'pickup truck', 'limo', 'limousine', 'fire truck',
        'coche', 'auto', 'carro', 'camión', 'camiones', 'camioneta', 'autobús', 'colectivo', 'moto', 'motocicleta',
        'bicicleta', 'barco', 'barca', 'bote', 'lancha', 'velero', 'helicóptero', 'avión', 'aviones', 'ambulancia',
        'patrulla', 'tren', 'furgoneta',
      ],
    },
  ],
  animals: [
    {
      terms: [
        'dog', 'sheepdog', 'puppy', 'cat', 'kitten', 'horse', 'pony', 'cow', 'sheep', 'goat', 'pig', 'chicken', 'hen', 'rooster',
        'bird', 'parrot', 'pigeon', 'seagull', 'gull', 'snake', 'rat', 'rabbit', 'donkey', 'mule', 'wolf',
        'fox', 'grizzly', 'deer', 'perro', 'perrito', 'cachorro', 'gato', 'gatito', 'caballo', 'yegua', 'vaca', 'oveja',
        'cabra', 'cerdo', 'gallina', 'gallo', 'pato', 'pájaro', 'loro', 'paloma', 'gaviota', 'serpiente', 'rata',
        'conejo', 'burro', 'mula', 'lobo', 'zorro', 'oso', 'ciervo',
      ],
    },
  ],
  background: [
    {
      terms: [
        'crowd', 'passer-by', 'passers-by', 'passersby', 'pedestrian', 'customer', 'diner', 'patron', 'guest',
        'waiters', 'students', 'soldiers', 'police officers', 'villagers', 'fishermen', 'workers', 'onlookers',
        'audience', 'dancers', 'tourists', 'commuters', 'shoppers', 'extras', 'multitud', 'transeúnte', 'peatón',
        'peatones', 'clientes', 'comensales', 'invitados', 'camareros', 'estudiantes', 'soldados', 'policías',
        'vecinos', 'aldeanos', 'pescadores', 'trabajadores', 'curiosos', 'público', 'bailarines', 'turistas',
        'figurantes',
      ],
    },
  ],
  stunts: [
    { label: 'Fight', terms: ['fight', 'fighting', 'brawl', 'punches', 'punched', 'pelea', 'peleando', 'pelean', 'golpea', 'puñetazo'] },
    { label: 'Fall', terms: ['falls down', 'falls over', 'falls off', 'falls to the ground', 'stumbles', 'trips', 'se cae', 'tropieza'] },
    { label: 'Jump', terms: ['jumps', 'leaps', 'salta', 'se lanza'] },
    { label: 'Chase', terms: ['chase', 'chases', 'persecución', 'persigue'] },
    { label: 'Crash', terms: ['crash', 'crashes', 'collision', 'choque', 'choca', 'colisión'] },
    { label: 'Thrown / knocked down', terms: ['thrown', 'knocked down', 'tackles', 'tackled', 'derriba'] },
  ],
  sfx: [
    { label: 'Rain', terms: ['rain', 'raining', 'downpour', 'drizzle', 'lluvia', 'llueve', 'llovizna'] },
    { label: 'Storm', terms: ['storm', 'tormenta', 'temporal'] },
    { label: 'Lightning', terms: ['lightning', 'relámpago', 'rayo'] },
    { label: 'Wind', terms: ['wind', 'gust', 'viento', 'ráfaga'] },
    { label: 'Fog', terms: ['fog', 'mist', 'haze', 'niebla', 'neblina', 'bruma'] },
    { label: 'Smoke', terms: ['smoke', 'smoking ruins', 'humo'] },
    { label: 'Fire', terms: ['fire', 'flames', 'blaze', 'burning', 'fuego', 'llamas', 'incendio'] },
    { label: 'Explosion', terms: ['explosion', 'explodes', 'blast', 'explosión', 'explota'] },
    { label: 'Snow', terms: ['snow', 'snowing', 'nieve', 'nieva'] },
    { label: 'Sparks', terms: ['sparks', 'chispas'] },
    { label: 'Breaking glass', terms: ['shatters', 'smashes the window', 'rompe el cristal', 'se rompe'] },
  ],
  makeup: [
    { label: 'Blood', terms: ['blood', 'bloody', 'bleeding', 'sangre', 'sangrando', 'ensangrentado'] },
    { label: 'Wound', terms: ['wound', 'wounded', 'injury', 'gash', 'herida', 'herido'] },
    { label: 'Scar', terms: ['scar', 'cicatriz'] },
    { label: 'Bruise', terms: ['bruise', 'black eye', 'moretón', 'moratón', 'hematoma'] },
    { label: 'Tattoo', terms: ['tattoo', 'tatuaje'] },
    { label: 'Sweat', terms: ['sweat', 'sweating', 'sudor', 'sudando'] },
    { label: 'Wig', terms: ['wig', 'peluca'] },
    { label: 'Beard', terms: ['beard', 'barba'] },
    { label: 'Ageing', terms: ['wrinkled', 'aged', 'arrugado', 'envejecido'] },
  ],
  wardrobe: [
    {
      terms: [
        'uniform', 'costume', 'dress', 'wedding dress', 'suit', 'raincoat', 'coat', 'jacket', 'hat', 'cap', 'helmet',
        'mask', 'sunglasses', 'apron', 'scarf', 'boots', 'gloves', 'oilskin', 'pyjamas', 'pajamas', 'robe',
        'uniforme', 'disfraz', 'vestido', 'traje', 'chubasquero', 'impermeable', 'abrigo', 'chaqueta', 'chamarra',
        'sombrero', 'gorra', 'casco', 'máscara', 'gafas', 'delantal', 'bufanda', 'botas', 'guantes', 'pijama',
        'bata',
      ],
    },
    { label: 'Wet clothes', terms: ['soaked', 'drenched', 'wet clothes', 'empapado', 'empapada', 'encharcado', 'encharcada'] },
  ],
  props: [
    {
      terms: [
        'phone', 'cellphone', 'mobile phone', 'telephone', 'gun', 'pistol', 'revolver', 'rifle', 'shotgun', 'knife',
        'sword', 'letter', 'envelope', 'photo', 'photograph', 'picture frame', 'bottle', 'wine glass', 'cup', 'mug',
        'cigarette', 'lighter', 'lantern', 'flashlight', 'candle', 'book', 'notebook', 'diary', 'newspaper', 'map',
        'key', 'wallet', 'purse', 'bag', 'backpack', 'suitcase', 'briefcase', 'umbrella', 'laptop', 'radio',
        'binoculars', 'rope', 'wedding ring', 'necklace', 'wristwatch', 'money', 'cash', 'coin', 'ticket', 'passport', 'gift',
        'thermos', 'logbook', 'lunchbox', 'handset', 'toolbox', 'crate', 'net', 'fishing rod', 'tray', 'plate', 'teléfono', 'móvil', 'celular', 'pistola',
        'revólver', 'escopeta', 'cuchillo', 'navaja', 'espada', 'carta', 'foto', 'fotografía', 'botella', 'copa',
        'vaso', 'taza', 'cigarrillo', 'cigarro', 'mechero', 'encendedor', 'linterna', 'farol', 'vela', 'libro',
        'cuaderno', 'periódico', 'mapa', 'llave', 'cartera', 'billetera', 'bolso', 'mochila', 'maleta', 'maletín',
        'paraguas', 'portátil', 'prismáticos', 'cuerda', 'anillo', 'collar', 'reloj', 'dinero', 'billete', 'moneda',
        'pasaporte', 'regalo', 'termo', 'bandeja', 'plato', 'caña de pescar', 'bolsa',
      ],
    },
  ],
  setdressing: [
    {
      terms: [
        'bed', 'table', 'sofa', 'couch', 'armchair', 'desk', 'lamp', 'curtains', 'fireplace', 'painting', 'mirror',
        'television', 'tv', 'bookshelf', 'shelves', 'stove', 'fridge', 'cama', 'mesa', 'sofá', 'sillón', 'escritorio',
        'lámpara', 'cortinas', 'chimenea', 'cuadro', 'espejo', 'televisor', 'estantería', 'estufa', 'nevera',
        'poltrona', 'estante',
      ],
    },
  ],
  greenery: [
    {
      terms: [
        'tree', 'forest', 'woods', 'garden', 'potted plant', 'flowers', 'bouquet', 'hedge', 'árbol', 'árboles', 'bosque',
        'jardín', 'flores', 'ramo',
      ],
    },
  ],
  camera: [
    { label: 'Slow motion', terms: ['slow motion', 'slow-motion', 'slow mo', 'cámara lenta', 'ralentí'] },
    { label: 'POV', terms: ['pov', 'point of view', 'punto de vista', 'subjetiva'] },
    { label: 'Time-lapse', terms: ['time-lapse', 'timelapse'] },
    { label: 'Handheld', terms: ['handheld', 'hand-held', 'cámara en mano'] },
    { label: 'Split screen', terms: ['split screen', 'pantalla dividida'] },
    { label: 'Oner', terms: ['oner', 'one-shot', 'plano secuencia'] },
  ],
  specialequip: [
    { label: 'Drone', terms: ['drone', 'aerial', 'dron', 'aéreo', 'aérea', 'plano aéreo'] },
    { label: 'Crane', terms: ['crane shot', 'crane', 'grúa'] },
    { label: 'Steadicam', terms: ['steadicam'] },
    { label: 'Underwater housing', terms: ['underwater', 'submerged', 'subacuático', 'bajo el agua'] },
    { label: 'Car rig / process trailer', terms: ['drives', 'driving', 'conduce', 'conduciendo', 'maneja', 'manejando'] },
  ],
  sound: [
    { label: 'Gunshot', terms: ['gunshot', 'shot rings out', 'disparo', 'balazo', 'tiro'] },
    { label: 'Siren', terms: ['siren', 'sirena'] },
    { label: 'Thunder', terms: ['thunder', 'trueno'] },
    { label: 'Foghorn', terms: ['foghorn', 'sirena de niebla'] },
    { label: 'Alarm', terms: ['alarm', 'alarma'] },
    { label: 'Phone ringing', terms: ['phone rings', 'ringing', 'suena el teléfono', 'el teléfono suena'] },
    { label: 'Scream', terms: ['scream', 'screams', 'grita', 'grito', 'gritos'] },
    { label: 'Knock at the door', terms: ['knock', 'knocks', 'golpes en la puerta', 'llaman a la puerta'] },
    { label: 'Doorbell', terms: ['doorbell', 'timbre'] },
    { label: 'Radio / TV audio', terms: ['radio crackles', 'static', 'estática', 'interferencia'] },
  ],
  music: [
    { label: 'Singing (playback)', terms: ['sings', 'singing', 'song', 'canta', 'cantando', 'canción'] },
    { label: 'Music playback', terms: ['music plays', 'music', 'música', 'tocadiscos', 'jukebox', 'vitrola'] },
    { label: 'Instrument', terms: ['guitar', 'piano', 'violin', 'accordion', 'guitarra', 'violín', 'acordeón'] },
    { label: 'Dance', terms: ['dances', 'dancing', 'baila', 'bailando'] },
  ],
  vfx: [
    { label: 'Green screen', terms: ['green screen', 'blue screen', 'chroma', 'croma', 'pantalla verde'] },
    { label: 'Hologram', terms: ['hologram', 'holograma'] },
    { label: 'Screen insert', terms: ['on the screen', 'on screen', 'en la pantalla'] },
  ],
};

/** Production risks, filed under Notes. Matched against the scene heading and action. */
export const RISK_TERMS: DictEntry[] = [
  { label: 'Risk: natural light timing (dawn/dusk)', terms: ['dawn', 'dusk', 'sunrise', 'sunset', 'magic hour', 'golden hour', 'twilight', 'amanecer', 'atardecer', 'anochecer', 'crepúsculo', 'madrugada', 'alba'] },
  { label: 'Risk: minors on set', terms: ['child', 'children', 'kid', 'baby', 'toddler', 'boy', 'girl', 'niño', 'niña', 'niños', 'bebé', 'chico', 'chica'] },
  { label: 'Risk: water work', terms: ['the sea', 'open sea', 'at sea', 'ocean', 'river', 'lake', 'pool', 'swims', 'swimming', 'waves', 'mar', 'océano', 'río', 'lago', 'piscina', 'olas', 'nadando'] },
  { label: 'Risk: weapons or pyro — armourer & safety', terms: ['gun', 'pistol', 'rifle', 'shotgun', 'explosion', 'gunshot', 'pistola', 'escopeta', 'explosión', 'disparo'] },
  { label: 'Risk: crowd scene', terms: ['crowd', 'multitud', 'hundreds of', 'cientos de'] },
];

/** Words in capitals that are screenplay directions, not characters. */
export const CAPS_STOPWORDS = new Set([
  'INT', 'EXT', 'CUT', 'TO', 'FADE', 'IN', 'OUT', 'V.O', 'O.S', 'O.C', 'CONT', "CONT'D", 'POV', 'CLOSE', 'ON', 'INSERT',
  'BACK', 'SCENE', 'CONTINUOUS', 'LATER', 'DAY', 'NIGHT', 'THE', 'A', 'AN', 'SUPER', 'TITLE', 'FLASHBACK', 'END',
  'MONTAGE', 'SERIES', 'OF', 'SHOTS', 'INTERCUT', 'ANGLE', 'WIDE', 'SLOW', 'MOTION', 'BLACK', 'SMASH', 'DISSOLVE',
  'MATCH', 'CONTINUED', 'MORE', 'AND', 'WITH', 'BEGIN', 'TV', 'OK', 'NO', 'YES', 'I', 'US', 'UK', 'FBI', 'CIA', 'GPS',
  'CORTE', 'FUNDIDO', 'NEGRO', 'DÍA', 'NOCHE', 'TARDE', 'FIN', 'DIA', 'PLANO', 'SOBRE', 'EL', 'LA', 'LOS',
  'LAS', 'DE', 'Y', 'O',
]);

/** Name prefixes that make the rest of a cast name usable on its own ("CAPTAIN RUI" → "Rui"). */
export const NAME_TITLES = new Set([
  'CAPTAIN', 'DOCTOR', 'DR', 'DR.', 'MR', 'MR.', 'MRS', 'MRS.', 'MS', 'MS.', 'MISS', 'OFFICER', 'DETECTIVE', 'FATHER',
  'SISTER', 'UNCLE', 'AUNT', 'CAPITÁN', 'CAPITAN', 'DOCTORA', 'SEÑOR', 'SEÑORA', 'DON', 'DOÑA', 'TÍO', 'TÍA', 'PADRE',
  'TIO', 'TIA',
]);
