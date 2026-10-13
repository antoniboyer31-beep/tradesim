# TradeSim — simulateur de trading crypto en local

Un site pour s'entraîner au trading avec de l'argent fictif, sur 20 monnaies fictives qui évoluent **en temps réel, 24h/24**, même quand le site est fermé.

## Lancer le site

Prérequis : [Node.js](https://nodejs.org) 18 ou plus récent.

```bash
npm install
npm start
```

Puis ouvre **http://localhost:3000** dans ton navigateur.

- Le premier lancement génère 3 ans d'historique de marché (quelques secondes).
- Laisse la fenêtre du terminal ouverte : c'est elle qui fait tourner le marché.
- Si tu arrêtes le serveur (Ctrl+C) et le relances plus tard, le marché **rattrape tout le temps écoulé** : les prix auront bougé, et tes ordres limites, stops, stop loss, take profit, liquidations et alertes se seront déclenchés comme si le marché avait tourné pendant ton absence.
- Toutes les données (marché + compte) sont sauvegardées dans `data/state.json`. Supprime ce fichier pour repartir d'un marché neuf.

Mode développement (rechargement à chaud) : `npm run dev` puis http://localhost:5173.

## Fonctionnalités

**Marché réaliste**
- 20 monnaies fictives aux prix très différents (de 0,00001 $ à 64 000 $) : grosses monnaies stables, altcoins, monnaies IA/DeFi/Gaming, meme coins ultra-volatils, et un jeton adossé à l'or.
- Moteur de prix qui reproduit les scénarios réels : accumulation, tendances, corrections, euphorie, distribution, capitulation, range, pump & dump, short squeeze, chocs d'actualité, phases de marché global (haussier, baissier, panique), volatilité en grappes, corrélation au leader NOVA, activité plus forte en journée.
- Carnet d'ordres, transactions en direct d'autres traders, chat de la communauté, fil d'actualités, nombre de traders en ligne.

**Graphiques** (moteur TradingView Lightweight Charts)
- Unités de temps : 1s, 5s, 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 12h, 1 jour, 1 semaine, 1 mois.
- Bougies, Heikin Ashi, ligne.
- Indicateurs : volume, MA 20, EMA 50, EMA 200, Bollinger, VWAP, RSI, MACD, Stochastique, supports/résistances automatiques.
- Tes positions, stop loss, take profit, prix de liquidation, ordres, alertes et exécutions s'affichent sur le graphique. Outil de tracé de lignes.

**Trading**
- Spot : ordres au marché, limites, stops ; stop loss automatique après un achat.
- Levier (futures) : long et short de x1 à x100, stop loss, take profit, liquidation, ajout de marge, fermeture partielle, stop au point mort.
- Frais maker/taker, spread et slippage selon la liquidité de chaque monnaie.
- Alertes de prix (avec notifications du navigateur).

**Aide au trading**
- Assistant en direct : tendance, RSI, MACD, divergences, Bollinger, volume, figures de bougies, supports/résistances, score technique, idées de stop/objectif basées sur l'ATR.
- Avertissements dans le formulaire : risque trop élevé, ratio risque/rendement faible, stop au-delà de la liquidation, levier excessif.
- 10 calculateurs : taille de position, risque/rendement, liquidation, espérance de gain, Fibonacci, points pivots, simulateur DCA, prix moyen, récupération de perte, intérêts composés.
- Académie : plus de 60 astuces, figures chartistes, scénarios de marché, glossaire, routine du trader et programme pour débuter.
- Portefeuille : courbe du capital, répartition, statistiques (taux de réussite, profit factor, drawdown…) et conseils d'un coach.
- Journal de trading.

**Argent fictif**
- Bouton « 💰 Argent » : ajouter ou retirer de l'argent, réinitialiser le compte avec le capital de ton choix, ou activer le **mode réaliste** qui désactive les dépôts.

## Structure

```
server/   moteur de marché, comptes, API et WebSocket (Node.js, Express, ws)
client/   interface (React, Vite, Lightweight Charts)
data/     sauvegarde automatique (créée au premier lancement)
```

Le serveur écoute uniquement sur `127.0.0.1` (variables `PORT` et `HOST` pour changer).
