const pick = (a) => a[Math.floor(Math.random() * a.length)];

const PREFIX = ['crypto', 'moon', 'whale', 'degen', 'hodl', 'satoshi', 'bull', 'bear', 'alpha', 'chart', 'pump', 'diamond', 'paper', 'lambo', 'fomo', 'wagmi', 'ape', 'shark', 'trader', 'scalp', 'swing', 'zen', 'max', 'lucas', 'julie', 'nico', 'sarah', 'tom', 'ines', 'yanis', 'lea', 'hugo', 'emma', 'karim', 'chloe', 'theo', 'manon', 'enzo', 'camille', 'noah'];
const SUFFIX = ['_fr', '42', '_trader', 'x', '_99', '_btc', 'king', '_off', '777', '_pro', '13', '_75', '_hands', 'boy', 'girl', '_moon', '01', '_69', '_lyon', '_paris'];

export function randomUser() {
  return pick(PREFIX) + pick(SUFFIX);
}

const NEWS_UP = [
  "{name} annonce un partenariat stratégique avec un géant de la tech",
  "{name} ({sym}) listé sur une nouvelle plateforme d'échange majeure",
  "Une baleine achète massivement du {sym} — 40 M$ déplacés en une heure",
  "Mise à jour réseau réussie pour {name} : frais divisés par 10",
  "Un fonds d'investissement dévoile une position importante sur {sym}",
  "Rumeur : un ETF {name} serait en préparation",
  "{name} brûle 5 % de son offre totale de jetons",
  "Une célébrité tweete sur {sym}, la communauté s'enflamme",
  "{name} dépasse 1 million d'utilisateurs actifs",
  "Les shorts sur {sym} se font liquider en cascade",
];
const NEWS_DOWN = [
  "Piratage : un protocole lié à {name} perd 25 M$",
  "{name} visé par une enquête du régulateur",
  "Une baleine transfère 30 M$ de {sym} vers un exchange — pression vendeuse",
  "Panne de plusieurs heures sur le réseau {name}",
  "L'équipe de {name} déverrouille une grosse tranche de jetons",
  "Rumeur de délistage de {sym} sur une plateforme",
  "Un fondateur de {name} vend une partie de ses jetons",
  "Bug critique découvert dans le contrat de {sym}",
  "Les longs à fort levier sur {sym} se font liquider",
  "{name} reporte sa mise à jour majeure de 6 mois",
];
const MARKET_UP = [
  "La banque centrale baisse ses taux : les actifs risqués s'envolent",
  "Inflation plus faible que prévu, le marché crypto rebondit",
  "Un grand pays adopte un cadre réglementaire favorable aux cryptos",
  "Afflux record de capitaux dans les fonds crypto cette semaine",
];
const MARKET_DOWN = [
  "Inflation plus forte que prévu : le marché crypto chute",
  "La banque centrale annonce une hausse des taux surprise",
  "Faillite d'une grosse plateforme de prêt crypto",
  "Liquidations massives sur tout le marché : plus de 800 M$ effacés",
];

export function coinNews(coin, up) {
  return pick(up ? NEWS_UP : NEWS_DOWN).replaceAll('{name}', coin.name).replaceAll('{sym}', coin.sym);
}
export function marketNews(up) {
  return pick(up ? MARKET_UP : MARKET_DOWN);
}

const CHAT_PUMP = [
  "{sym} qui part en fusée 🚀🚀", "j'ai raté le départ de {sym}... je rentre ou pas ?", "{sym} +{ch}% c'est n'importe quoi",
  "attention FOMO sur {sym}, attendez un pullback", "je prends mes profits sur {sym}, merci", "{sym} to the moon !!!",
  "qui a acheté {sym} hier ? bien joué", "le RSI de {sym} est en surachat là", "short {sym} ici c'est du suicide",
];
const CHAT_DUMP = [
  "{sym} qui saigne 😭", "je me suis fait stop sur {sym}", "{sym} {ch}%... je renforce", "c'est le moment d'acheter {sym} ou on attend ?",
  "panique sur {sym}, gardez la tête froide", "mon long {sym} vient de se faire liquider 💀", "support cassé sur {sym}", "{sym} c'est fini pour moi",
  "ceux qui ont shorté {sym} ont gagné", "ne rattrapez pas un couteau qui tombe sur {sym}",
];
const CHAT_GENERIC = [
  "salut tout le monde", "vous tradez quoi aujourd'hui ?", "le marché est calme", "j'attends une cassure sur NOVA",
  "toujours mettre un stop loss les gars", "quelqu'un utilise le MACD en 15m ?", "je suis en range trading sur GLDX",
  "on dirait que NOVA prépare un gros mouvement", "jamais plus de 2% de risque par trade", "DCA sur NOVA chaque semaine depuis 1 an",
  "les memecoins c'est le casino", "qui scalpe en 1m ?", "bonne journée à tous", "patience = profits",
  "faut pas trader sous le coup des émotions", "je regarde le daily avant de trader le 5m",
];

export function chatMessage(movers) {
  const r = Math.random();
  const hot = movers.filter((m) => Math.abs(m.ch1h) > 1.5);
  if (hot.length && r < 0.65) {
    const m = pick(hot);
    const tpl = pick(m.ch1h > 0 ? CHAT_PUMP : CHAT_DUMP);
    return tpl.replaceAll('{sym}', m.sym).replaceAll('{ch}', m.ch1h.toFixed(1));
  }
  return pick(CHAT_GENERIC);
}
