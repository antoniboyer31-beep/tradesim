// vol = volatilité annualisée propre à la monnaie, beta = sensibilité au marché global,
// tail = amplification des mouvements extrêmes (pump, dump, squeeze), volume = volume quotidien moyen en $,
// spread = écart achat/vente relatif, jumpRate = nombre moyen d'actualités choc par jour.
export const COINS = [
  { sym: 'NOVA', name: 'NovaCoin', cat: 'Layer 1', base: 64250, vol: 0.32, beta: 1.0, tail: 0.8, volume: 28e9, spread: 0.00002, jumpRate: 0.25, color: '#f7931a', desc: "La première et la plus grosse monnaie du marché. Elle donne la direction générale : quand NOVA chute, presque tout chute avec elle." },
  { sym: 'AETH', name: 'Aether', cat: 'Layer 1', base: 3150, vol: 0.45, beta: 1.15, tail: 0.9, volume: 14e9, spread: 0.00003, jumpRate: 0.3, color: '#7b8cff', desc: "Blockchain de smart contracts n°2. Très liquide, suit NOVA avec un peu plus d'amplitude." },
  { sym: 'SOLR', name: 'Solaris', cat: 'Layer 1', base: 148.6, vol: 0.7, beta: 1.35, tail: 1.1, volume: 3.2e9, spread: 0.00005, jumpRate: 0.4, color: '#14f195', desc: "Blockchain rapide très populaire chez les traders. Mouvements nerveux, tendances fortes." },
  { sym: 'GLDX', name: 'GoldX', cat: 'Actif réel', base: 2368, vol: 0.12, beta: 0.15, tail: 0.4, volume: 6e8, spread: 0.00004, jumpRate: 0.08, color: '#e5c158', desc: "Jeton adossé à l'or. Très peu volatil, valeur refuge quand le marché panique." },
  { sym: 'TTN', name: 'Titan', cat: 'Layer 1', base: 612.4, vol: 0.5, beta: 1.05, tail: 0.9, volume: 1.6e9, spread: 0.00005, jumpRate: 0.3, color: '#f3ba2f', desc: "Jeton d'une grande plateforme d'échange. Assez stable pour une altcoin." },
  { sym: 'HLS', name: 'Helios', cat: 'IA', base: 312.8, vol: 0.85, beta: 1.3, tail: 1.3, volume: 9e8, spread: 0.00008, jumpRate: 0.55, color: '#ff8a3d', desc: "Projet d'intelligence artificielle décentralisée. Très sensible aux annonces." },
  { sym: 'VTX', name: 'Vortex', cat: 'DeFi', base: 72.15, vol: 0.8, beta: 1.25, tail: 1.2, volume: 5.5e8, spread: 0.0001, jumpRate: 0.5, color: '#00c2ff', desc: "Protocole d'échange décentralisé. Réagit fort aux piratages et aux mises à jour." },
  { sym: 'ATL', name: 'Atlas', cat: 'Oracle', base: 14.82, vol: 0.75, beta: 1.2, tail: 1.1, volume: 6.2e8, spread: 0.0001, jumpRate: 0.4, color: '#2a5ada', desc: "Réseau d'oracles qui fournit des données aux autres blockchains." },
  { sym: 'QTX', name: 'Quantix', cat: 'Layer 2', base: 18.47, vol: 0.9, beta: 1.3, tail: 1.3, volume: 4.1e8, spread: 0.00012, jumpRate: 0.5, color: '#9b5cff', desc: "Solution de mise à l'échelle. Volatile, beaucoup de faux départs." },
  { sym: 'EMB', name: 'Ember', cat: 'Gaming', base: 9.84, vol: 1.0, beta: 1.4, tail: 1.5, volume: 2.6e8, spread: 0.00015, jumpRate: 0.6, color: '#ff4d6d', desc: "Jeton de jeu vidéo play-to-earn. Pumps fréquents lors des annonces de partenariats." },
  { sym: 'ORB', name: 'Orbit', cat: 'Interop', base: 6.21, vol: 0.85, beta: 1.25, tail: 1.2, volume: 3e8, spread: 0.00015, jumpRate: 0.45, color: '#e6007a', desc: "Protocole qui relie les blockchains entre elles." },
  { sym: 'ZNT', name: 'Zenith', cat: 'Layer 1', base: 1.352, vol: 0.9, beta: 1.3, tail: 1.3, volume: 3.5e8, spread: 0.0002, jumpRate: 0.45, color: '#00d1b2', desc: "Blockchain écologique. Longues phases de range puis cassures violentes." },
  { sym: 'LUNX', name: 'Lunex', cat: 'DeFi', base: 0.8512, vol: 0.95, beta: 1.4, tail: 1.6, volume: 2.2e8, spread: 0.0002, jumpRate: 0.6, color: '#ffd166', desc: "Monnaie DeFi à rendement. Attention aux effondrements brutaux." },
  { sym: 'NMB', name: 'Nimbus', cat: 'Stockage', base: 0.4821, vol: 0.95, beta: 1.2, tail: 1.3, volume: 1.5e8, spread: 0.00025, jumpRate: 0.45, color: '#5ec8f2', desc: "Stockage de fichiers décentralisé. Volume plus faible, mouvements par à-coups." },
  { sym: 'ECH', name: 'Echo', cat: 'Social', base: 0.2734, vol: 1.0, beta: 1.35, tail: 1.6, volume: 1.2e8, spread: 0.0003, jumpRate: 0.6, color: '#c77dff', desc: "Réseau social décentralisé. Hype rapide, chutes rapides." },
  { sym: 'DOGO', name: 'Dogo', cat: 'Meme', base: 0.1247, vol: 1.0, beta: 1.5, tail: 2.0, volume: 1.1e9, spread: 0.0002, jumpRate: 0.8, color: '#c2a633', desc: "Le meme coin historique. Énorme communauté, réagit aux tweets des célébrités." },
  { sym: 'PXL', name: 'Pixel', cat: 'NFT', base: 0.03215, vol: 1.1, beta: 1.4, tail: 2.0, volume: 9e7, spread: 0.0004, jumpRate: 0.7, color: '#ff6ec7', desc: "Jeton d'une place de marché NFT. Très spéculatif." },
  { sym: 'KRY', name: 'Kryo', cat: 'Meme', base: 0.004218, vol: 1.25, beta: 1.5, tail: 2.4, volume: 7e7, spread: 0.0005, jumpRate: 0.9, color: '#7ae7ff', desc: "Petit meme coin. Pumps et dumps violents, liquidité faible." },
  { sym: 'PLSR', name: 'Pulsar', cat: 'Micro-cap', base: 0.0008931, vol: 1.35, beta: 1.4, tail: 2.6, volume: 3.5e7, spread: 0.0008, jumpRate: 1.0, color: '#8aff80', desc: "Micro-capitalisation. Peut faire +50 % ou -40 % en une journée." },
  { sym: 'MNY', name: 'Moony', cat: 'Meme', base: 0.00001842, vol: 1.45, beta: 1.6, tail: 3.0, volume: 4.5e8, spread: 0.0006, jumpRate: 1.1, color: '#ffb703', desc: "Le meme coin le plus fou du marché. Ultra volatil : idéal pour apprendre à gérer le risque." },
];

export const COIN_MAP = Object.fromEntries(COINS.map((c) => [c.sym, c]));
