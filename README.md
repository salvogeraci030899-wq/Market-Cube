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
- **Cache** lato server di 60s: aprire più schede non moltiplica le chiamate alle API gratuite.
- Interazione: trascina per ruotare, clicca una metrica per portarla di fronte.

## Uso

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # test della logica dati
```

Per l'uso quotidiano: `npm run build && npm start`. Funziona anche su Vercel (piano gratuito).
Nota: Binance blocca gli IP USA; se ospiti dagli USA entrano in gioco in automatico Coinbase e Bybit/OKX.

*Indicatore informativo, non è un consiglio finanziario.*
