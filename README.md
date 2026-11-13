# Market Cube

Un cubo 3D che mostra il sentiment del mercato crypto. Progetto personale, gratuito, senza account né chiavi API.

Mostra le **prime 20 monete per capitalizzazione** (escluse stablecoin e token "wrapped"). Scegli una moneta dalla fila in alto: ogni tessera mostra già il suo punteggio, così vedi a colpo d'occhio chi è in euforia e chi in panico. La scelta viene ricordata.

Ogni moneta ha il suo cubo; ogni faccia è una metrica con punteggio 0–100 (rosso/arancio = paura, viola = neutro, ciano/verde = euforia):

| Faccia | Metrica | Fonte |
|---|---|---|
| Davanti | Variazione 24 ore | CoinGecko (ripiego: Binance) |
| Dietro | Variazione 7 giorni | CoinGecko (ripiego: candele Binance/Coinbase) |
| Destra | Variazione 30 giorni | CoinGecko (ripiego: candele Binance/Coinbase) |
| Sinistra | Fear & Greed Index (mercato) | alternative.me |
| Sotto | Funding rate della moneta | Bybit → OKX |
| Sopra | Forza vs BTC (24h); per BTC: ampiezza del mercato | CoinGecko |

- **Punteggi confrontabili tra monete**: le variazioni sono misurate in unità di volatilità tipica di ciascuna moneta (σ, calcolata sugli ultimi 7 giorni di prezzi orari). +1σ = +20 punti, ±2,5σ = estremo. Così lo stesso +5% vale molto per BTC (norma ±2%) e poco per una memecoin (norma ±10%), e le tessere in alto si possono confrontare. Sotto ogni metrica vedi quanti σ vale la variazione e la "norma" della moneta.
- **Sentiment totale**: media pesata delle sole metriche disponibili (minimo 3, altrimenti "dati insufficienti").
- **Volatilità**: volatilità realizzata della moneta nelle ultime 24h (candele orarie, annualizzata) rapportata alla sua norma degli ultimi 90 giorni. Più è alta, più il cubo ruota veloce e vibra.
- **Nessun dato inventato**: se una fonte non risponde la faccia diventa grigia ("n/d"); un dato recente ma non aggiornato resta al massimo 15 minuti, marcato "precedente". Se tutto è offline vedi l'ultimo snapshot con l'avviso "DATI VECCHI".
- **Look**: nero OLED, bianco e neon fluo, in stile cyberpunk/HUD da videogioco (cubo olografico su pavimento a griglia, barre a segmenti, allerta lampeggiante in zona estrema). Rispetta "riduci animazioni".
- **Effetti**: l'interruttore "EFFETTI" in basso spegne scanlines, aloni e animazioni di sfondo (utile su dispositivi poco potenti o per la batteria). La scelta è ricordata e parte già spento se il sistema chiede di ridurre le animazioni.
- **Cache** di 30s nel browser, aggiornamento automatico ogni 60s (in pausa quando la scheda è nascosta).
- Interazione: trascina per ruotare, clicca una metrica per portarla di fronte.
- **Storico 90 giorni**: confronto "oggi vs ultimi 90 giorni" con percentile, minimo e massimo. Si ricostruisce subito da dati pubblici (momentum 24h e trend 30g della moneta, una moneta di riferimento, Fear & Greed); funding e metriche a più giorni non hanno uno storico gratuito e ne restano fuori.
- **Zona alta/bassa**: quando oggi è tra il 10% più alto/basso degli ultimi 90 giorni il cubo si circonda di un alone pulsante e il titolo della scheda mostra ▲/▼ insieme al punteggio.
- **Avvisi**: con il pulsante "Avvisi" il browser ti notifica al cambio di zona (una sola volta, non a ogni aggiornamento). Funzionano finché la scheda resta aperta.

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

Note: i dati sono richiesti dal tuo browser, quindi se Binance è bloccato nel tuo paese entrano in automatico Coinbase e Bybit/OKX. Ogni scheda aperta aggiorna da sola ogni 60 secondi. Gli avvisi valgono per la moneta selezionata.

*Indicatore informativo, non è un consiglio finanziario.*
