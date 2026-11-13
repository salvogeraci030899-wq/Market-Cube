# Market Cube

Un cubo 3D che mostra il sentiment del mercato crypto. Progetto personale, gratuito, senza account né chiavi API.

Ogni faccia è una metrica con punteggio 0–100 (rosso = panico, viola = neutro, verde = euforia):

| Faccia | Metrica | Fonte |
|---|---|---|
| Davanti | BTC variazione 24h | CoinGecko → Binance → Coinbase |
| Dietro | ETH variazione 24h | CoinGecko → Binance → Coinbase |
| Destra | Fear & Greed Index | alternative.me |
| Sinistra | Trend: BTC vs media 30 giorni | Binance → Coinbase |
| Sopra | Ampiezza: quante delle top 50 coin sono in rialzo | CoinGecko |
| Sotto | Funding rate BTC perpetual | OKX → Bybit |

- **Sentiment totale**: media pesata delle sole metriche disponibili (minimo 3, altrimenti "dati insufficienti").
- **Volatilità**: volatilità realizzata di BTC sulle ultime 24h (candele orarie), annualizzata. Più è alta, più il cubo ruota veloce e vibra.
- **Nessun dato inventato**: se una fonte non risponde la faccia diventa grigia ("n/d"); un dato recente ma non aggiornato resta al massimo 15 minuti, marcato "precedente". Se tutto è offline vedi l'ultimo snapshot con l'avviso "DATI VECCHI".
- **Cache** di 30s nel browser, aggiornamento automatico ogni 60s (in pausa quando la scheda è nascosta).
- Interazione: trascina per ruotare, clicca una metrica per portarla di fronte.

## Uso in locale

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # test della logica dati
```

## Pubblicazione su GitHub Pages (gratis)

Il sito è completamente statico: i dati vengono letti direttamente dal browser dalle API pubbliche, non serve alcun server.

1. Porta il codice sul branch `main` (merge del branch di lavoro).
2. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Il workflow `.github/workflows/pages.yml` parte a ogni push su `main` (o a mano da **Actions → Deploy su GitHub Pages → Run workflow**), esegue i test, costruisce il sito e lo pubblica.
4. Il sito sarà su `https://<utente>.github.io/<nome-repo>/`.

Note: i dati sono richiesti dal tuo browser, quindi se Binance è bloccato nel tuo paese entrano in automatico Coinbase e Bybit/OKX. Ogni scheda aperta aggiorna da sola ogni 60 secondi.

*Indicatore informativo, non è un consiglio finanziario.*
