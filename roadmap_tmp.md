# Cinema Studio Roadmap Temporanea

Obiettivo: portare Cinema Studio da fondazione di preview a sistema cinematografico completo per l'editor, con timeline, camera cuts, shot editing, binding e parametri in stile engine professionale. Il riferimento e' il livello di capacita' di strumenti come il Sequencer di Unreal, non una copia di UI, testi, codice, layout, icone o flussi proprietari.

Vincolo fondamentale: Cinema Studio deve restare browser-only. Tutto cio' che serve per authoring, preview e playback editor deve funzionare dentro il browser/editor. Export video, tool esterni, finestre native, CLI o servizi cloud sono fuori scope per questa fase. Obiettivo futuro: full offline, con librerie vendorizzate nel progetto quando necessario.

## 0.0 Stato di Avanzamento

Legenda: `[FATTO]` implementato nel codice; `[PARZIALE]` esiste una base ma non e' completo; `[DA FARE]` non ancora implementato; `[FUORI SCOPE]` lasciato fuori da questa fase.

### 0.0.1 Stato base attuale

0.0.1.1 `[FATTO]` Base Cinema Studio browser-only completata per authoring editor: creazione timeline, camera cut, binding a Scene Camera, trim/move, marker, object keyframe, preview timeline, preview flottante e trigger base.

0.0.1.2 `[FATTO]` Le camere usate dai cut sono Scene Camera reali create nella scena, non camere private della timeline.

0.0.1.3 `[FATTO]` Ogni Cinema Studio e' una timeline separata in scena, selezionabile, duplicabile e piazzabile dagli Assets.

0.0.1.4 `[FATTO]` La timeline puo' partire da Play Preview (`on-play`) o da Collision Box tramite `runtime-event`.

0.0.1.5 `[FATTO]` Lo schema dati base e' versionato (`cinemaProps.version = 2`) e migra `movieTrack` legacy verso `cameraCuts`.

0.0.1.6 `[PARZIALE]` Non e' ancora completata la parte avanzata: near/far lens keys, blend/continuous mode, curve editor, track controls completi, context menu, zoom/pan timeline e test browser round-trip save/reload.

### 0.1 Stato generale

0.1.1 `[FATTO]` Camera cut editing base: i cut si selezionano, si rinominano, si duplicano, si spostano, si accorciano/allungano, hanno camera modificabile e input start/duration/end.

0.1.2 `[PARZIALE]` Timeline multi-track: ora Camera Cuts, Markers, Object Keys, Lens Keys ed Events sono righe separate; zoom/pan base pronto; mancano track controls.

0.1.3 `[PARZIALE]` Regole avanzate cut: gap e overlap sono evidenziati come warning; mancano modalita' continuous/free/blend e risoluzione automatica.

0.1.4 `[FATTO]` Details panel base: esiste per camera cut, marker, object key e object track base.

0.1.5 `[PARZIALE]` Undo/redo timeline: add/delete/duplicate/edit camera cut, marker e object key, trim/move cut, binding camera, curve key e drag keyframe sono integrati nel `history-manager`; restano curve avanzate e futuri track controls.

0.1.6 `[PARZIALE]` Salvataggio: `cinemaProps.version` e `cameraCuts` sono introdotti con alias legacy `movieTrack`; manca test completo di salvataggio/ricarica su progetto reale.

0.1.7 `[FATTO]` Preview base: la viewport timeline valuta camera cut e object track, mostra overlay camera/shot attivo, il trigger `on-play` funziona in Play Preview e le Collision Box possono chiamare timeline `runtime-event`.

0.1.7.1 `[FATTO]` Preview flottante timeline browser-only, renderizzata nel canvas WebGL esistente, con aspect ratio selezionabile.

0.1.8 `[PARZIALE]` Camera/lens authoring: align camera/view, look-through e FOV keyframe sono disponibili; mancano near/far keyframe e parametri ottici avanzati.

0.1.9 `[PARZIALE]` Validazione: camera mancante, gap, overlap, cut fuori durata, target mancanti, key fuori durata e id duplicati vengono evidenziati; mancano regole di fix automatico e report completo.

### 0.2 Modifiche gia' fatte nel primo pass

0.2.1 `[FATTO]` Aggiunto pannello dettagli cut nella timeline.

0.2.2 `[FATTO]` Aggiunto cambio camera per cut selezionato.

0.2.3 `[FATTO]` Aggiunti input start, duration ed end per camera cut.

0.2.4 `[FATTO]` Aggiunto drag del corpo clip per spostare il cut.

0.2.5 `[FATTO]` Aggiunto trim da bordo sinistro e destro.

0.2.6 `[FATTO]` Aggiunto snap a frame durante drag/trim usando gli FPS dello studio.

0.2.7 `[FATTO]` Aggiunti handle e stato visuale selected/dragging dei camera cut.

0.2.8 `[FATTO]` Verifica sintattica con `node --check` su `js/editor/cinema-studio.js` e `js/editor/editor-template.js`.

0.2.9 `[FATTO]` Cinema Studio appare come asset/timeline piazzabile dagli Assets: ogni timeline ha chiave asset propria, puo' essere selezionata, duplicata e trascinata nel viewport.

### 0.3 Prossimo blocco consigliato

0.3.1 `[FATTO]` Rifare la timeline come multi-track minima: colonna track, riga camera cuts, riga object keys, playhead condiviso.

0.3.2 `[FATTO]` Aggiungere ruler temporale e click nel ruler per spostare il playhead.

0.3.3 `[FATTO]` Aggiungere marker track.

0.3.4 `[PARZIALE]` Spostare editing dettagliato fuori dall'inspector Cinema Studio duplicato e lasciarlo nella timeline: editing puntuale e' nella timeline, resta pulizia inspector avanzata.

0.3.5 `[FATTO]` Aggiungere preview flottante timeline per vedere il footage montato senza uscire dal browser.

## 1.0 Fondazione Concettuale e Dati

### 1.1 Definire il modello Cinema Studio definitivo

1.1.1 `[FATTO]` Separare chiaramente `Cinema Studio` come regista/timeline dal concetto di `Scene Camera`.

1.1.2 `[PARZIALE]` Rendere ogni clip di timeline una entita' esplicita con id stabile, nome, tipo, start, duration, end calcolato, colore e stato selezionato: base pronta, restano colore/note avanzate.

1.1.3 `[FATTO]` Consolidare `movieTrack` in una struttura piu' chiara, ad esempio `cameraCuts`, mantenendo migrazione dai salvataggi vecchi.

1.1.4 `[FATTO]` Definire un formato unico per i tempi: secondi interni, con visualizzazione a frame quando serve.

1.1.5 `[PARZIALE]` Aggiungere `fps`, `duration`, `workStart`, `workEnd`, `snapEnabled`, `snapMode`, `playbackMode`: `fps`, `duration`, snap frame e playback base sono pronti; work range/snap mode avanzati restano futuri.

1.1.6 `[FATTO]` Aggiungere versioning dati, ad esempio `cinemaProps.version`, per poter migrare le timeline future senza rompere livelli salvati.

### 1.2 Definire i tipi di track

1.2.1 `Camera Cut Track`: decide quale camera e' attiva nel tempo.

1.2.2 `Camera Transform Track`: anima posizione, rotazione e scala delle scene camera.

1.2.3 `[PARZIALE]` `Camera Lens Track`: anima FOV; near, far e parametri ottici avanzati restano futuri.

1.2.4 `Object Transform Track`: anima oggetti, luci, effetti e target scelti dall'utente.

1.2.5 `[FATTO]` `Event Track`: prepara eventi puntuali runtime/editor con nome evento e payload semplice.

1.2.6 `[FATTO]` `Marker Track`: appunti, beat narrativi, cue di gameplay e note di montaggio.

### 1.3 Definire le regole di valutazione

1.3.1 Stabilire cosa succede nei gap tra camera cut: nessuna camera, camera precedente, camera default o fallback esplicito.

1.3.2 Stabilire cosa succede negli overlap: priorita', blend, oppure divieto se il track non supporta blending.

1.3.3 Rendere il comportamento dei camera cut prevedibile: hard cut di default, blend solo se abilitato.

1.3.4 `[FATTO]` Separare la valutazione editor-preview dalla futura valutazione runtime.

1.3.5 `[FATTO]` Aggiungere validazione dati per clip fuori durata, durata nulla, camera mancanti, target mancanti, key fuori durata e id duplicati.

## 2.0 Timeline UI Rifattorizzata

### 2.1 Struttura visiva della timeline

2.1.1 `[FATTO]` Sostituire la singola riga marker con una timeline multi-track.

2.1.2 `[PARZIALE]` Creare una testata timeline con nome studio, tempo corrente, durata, fps, snap, play/stop e lock: mancano controlli snap completi.

2.1.3 `[PARZIALE]` Creare una colonna sinistra per nomi track, pulsanti track e stato visibility/lock.

2.1.4 `[FATTO]` Creare area destra per clip, keyframe, playhead, ruler e griglia.

2.1.5 `[FATTO]` Mostrare ruler temporale in secondi e/o frame.

2.1.6 Evidenziare work range e playback range.

### 2.2 Interazione base

2.2.1 `[FATTO]` Click su clip per selezionarla.

2.2.2 `[FATTO]` Click su vuoto per deselezionare.

2.2.3 `[FATTO]` Drag del playhead per scrubbare, oltre a slider e click ruler.

2.2.4 `[FATTO]` Click nel ruler per spostare il playhead.

2.2.5 `[FATTO]` Zoom orizzontale base della timeline.

2.2.6 `[FATTO]` Pan orizzontale base quando la timeline supera la larghezza visibile.

2.2.7 Selezione multipla futura, ma non obbligatoria nel primo pass.

### 2.3 Stato selezione e pannello dettagli

2.3.1 `[FATTO]` Unificare `ED.cinemaSelectedItem` per clip, keyframe, track e marker.

2.3.2 `[FATTO]` Mostrare un pannello dettagli per l'elemento selezionato.

2.3.3 `[PARZIALE]` Per una camera cut clip mostrare nome, start, duration, end, camera collegata, colore e note: nome/start/duration/end/camera sono pronti, colore e note restano futuri.

2.3.4 `[PARZIALE]` Per un keyframe mostrare tempo, proprieta' animate, curva e valore: tempo/curva/target pronti, valori transform dettagliati restano futuri.

2.3.5 `[PARZIALE]` Per una track mostrare target, tipo track, lock, mute e colore: target e conteggio key pronti, lock/mute/colore restano futuri.

## 3.0 Camera Cut Track Professionale

### 3.1 Creazione dei cut

3.1.1 `[FATTO]` Aggiungere cut al playhead dalla camera selezionata.

3.1.2 `[FATTO]` Aggiungere cut scegliendo una camera da menu.

3.1.3 Creare automaticamente una Scene Camera se l'utente sceglie "new camera".

3.1.4 `[FATTO]` Aggiungere opzione "insert cut at playhead" che taglia il clip corrente in due.

3.1.5 `[FATTO]` Aggiungere opzione "append cut" che crea un nuovo clip dopo l'ultimo cut.

### 3.2 Editing del cut

3.2.1 `[FATTO]` Drag del corpo clip per spostare start mantenendo duration.

3.2.2 `[FATTO]` Drag bordo sinistro per trim start.

3.2.3 `[FATTO]` Drag bordo destro per trim end/duration.

3.2.4 `[FATTO]` Input numerici nel pannello dettagli per start, end e duration.

3.2.5 `[FATTO]` Snap al frame in base a `fps`.

3.2.6 `[PARZIALE]` Clamp alla durata dello studio e al work range quando attivo.

3.2.7 `[FATTO]` Duplicate cut.

3.2.8 `[FATTO]` Delete cut.

3.2.9 `[FATTO]` Rename cut.

### 3.3 Binding camera per clip

3.3.1 `[FATTO]` Ogni cut deve avere un `cameraId` modificabile dopo la creazione.

3.3.2 `[FATTO]` Il pannello dettagli deve mostrare un select "Camera".

3.3.3 Se la camera collegata viene cancellata, il clip deve diventare invalid ma restare recuperabile.

3.3.4 `[FATTO]` Evidenziare clip con camera mancante.

3.3.5 `[FATTO]` Aggiungere comando "select bound camera".

3.3.6 `[FATTO]` Aggiungere comando "look through bound camera".

3.3.7 `[FATTO]` Aggiungere comando "replace camera with selected".

### 3.4 Regole gap e overlap

3.4.1 Modalita' `continuous`: i cut si toccano e non lasciano gap.

3.4.2 Modalita' `free`: i cut possono avere gap.

3.4.3 Modalita' `blend`: i cut possono sovrapporsi per transizioni.

3.4.4 Se `continuous` e' attivo, il trim di un bordo condiviso deve aggiornare anche il cut vicino.

3.4.5 `[FATTO]` Se `free` e' attivo, il gap deve mostrare chiaramente che non c'e' camera cut attiva.

3.4.6 Se `blend` e' attivo, l'overlap deve produrre una transizione controllata.

### 3.5 Preview camera cuts

3.5.1 La viewport timeline deve sempre mostrare la camera attiva al tempo corrente.

3.5.2 Lo scrub deve aggiornare immediatamente camera, target animati e parametri.

3.5.3 La riproduzione deve rispettare one-shot, loop e work range.

3.5.4 Quando non esiste camera attiva, mostrare fallback visivo chiaro.

3.5.5 `[FATTO]` Aggiungere overlay viewport con nome clip e camera attiva.

3.5.6 `[FATTO]` Aggiungere preview flottante browser-only della timeline con aspect ratio selezionabile.

## 4.0 Camera e Shot Authoring

### 4.1 Scene Camera migliorata

4.1.1 Aggiungere nome camera visibile e rinominabile rapidamente.

4.1.2 Aggiungere preview frustum piu' leggibile.

4.1.3 Aggiungere toggle helper, colore helper e dimensione helper.

4.1.4 `[FATTO]` Aggiungere comando "align camera to editor view".

4.1.5 `[FATTO]` Aggiungere comando "align editor view to camera".

4.1.6 Aggiungere comando "duplicate camera".

### 4.2 Parametri camera animabili

4.2.1 `[FATTO]` FOV animabile con Lens Keys.

4.2.2 Near/far clip animabili.

4.2.3 Roll camera animabile.

4.2.4 DOF futuro: enabled, focus distance, aperture/intensity.

4.2.5 Color grade futuro: exposure, contrast, saturation, tint.

### 4.3 Shot come contenitore logico

4.3.1 Introdurre opzionalmente `Shot` come clip narrativa sopra i camera cut.

4.3.2 Uno shot puo' contenere camera cut, keyframe e note.

4.3.3 Lo shot puo' avere nome, colore, descrizione e take.

4.3.4 Non implementare subito sub-sequence complete, ma preparare il modello dati.

## 5.0 Keyframe e Curve

### 5.1 Keyframe editing

5.1.1 `[FATTO]` I keyframe devono essere trascinabili nel tempo.

5.1.2 `[FATTO]` I keyframe devono avere input numerico tempo.

5.1.3 `[PARZIALE]` I keyframe devono poter essere cancellati, duplicati e copiati: delete e duplicate sono pronti, copy/paste resta futuro.

5.1.4 Aggiungere selezione del target dalla track.

5.1.5 Evitare che lo scrub sovrascriva accidentalmente il target selezionato mentre l'utente lo sta muovendo.

### 5.2 Curve

5.2.1 Supportare linear, ease-in, ease-out, ease-in-out.

5.2.2 Chiarire che `manual` non e' ancora una curva manuale vera finche' non esiste curve editor.

5.2.3 Aggiungere gestione tangenti futura.

5.2.4 Aggiungere editor curva futuro in pannello dedicato.

### 5.3 Proprieta' animate

5.3.1 Separare track transform in position, rotation e scale se necessario.

5.3.2 Permettere keyframe solo di alcune proprieta'.

5.3.3 Aggiungere indicatore visivo delle proprieta' keyate.

5.3.4 Validare valori scala e rotazione.

## 6.0 Inspector e Workflow Utente

### 6.1 Inspector Cinema Studio

6.1.1 Tenere nel Cinema Studio inspector solo impostazioni generali.

6.1.2 Spostare editing puntuale di cut/key/track nel pannello dettagli timeline.

6.1.3 Mostrare avvisi: camera mancanti, clip fuori range, track vuote.

6.1.4 Aggiungere pulsanti principali: open timeline, play, stop, add camera cut, add target track.

### 6.2 Timeline details panel

6.2.1 `[FATTO]` Dettagli clip camera cut.

6.2.2 `[FATTO]` Dettagli keyframe.

6.2.3 `[FATTO]` Dettagli track base.

6.2.4 `[FATTO]` Dettagli marker.

6.2.5 `[PARZIALE]` Applicare modifiche live con undo/redo: coperto per cut, marker e object key; restano track details e controlli futuri.

### 6.3 Menu contestuali

6.3.1 Right click su timeline vuota: add camera cut, add marker, add event, add track.

6.3.2 Right click su cut: rename, duplicate, delete, replace camera, select camera.

6.3.3 Right click su track: lock, mute, delete, select target.

6.3.4 Right click su keyframe: curve, delete, duplicate.

## 7.0 Undo, Redo e Salvataggio

### 7.1 Undo/redo

7.1.1 `[PARZIALE]` Ogni modifica timeline base passa da history manager: restano controlli futuri di track/lens/curve avanzate.

7.1.2 `[FATTO]` Drag continuo deve generare una singola operazione undo a fine drag.

7.1.3 `[FATTO]` Creazione, delete, trim, move, binding camera e keyframe devono essere annullabili.

### 7.2 Salvataggio e migrazione

7.2.1 `[FATTO]` Salvare il nuovo schema dentro `cinemaProps`.

7.2.2 `[FATTO]` Migrare `movieTrack` legacy verso `cameraCuts`.

7.2.3 `[FATTO]` Mantenere compatibilita' con livelli vecchi.

7.2.4 `[FATTO]` Aggiungere normalizzazione robusta in `scene-store.js`.

7.2.5 Aggiungere test manuale di round-trip: save, reload, preview.

## 8.0 Runtime Preview e Trigger

### 8.1 Preview editor

8.1.1 Continuare a usare la viewport timeline come preview primaria.

8.1.2 Rendere il playhead indipendente dal selection state.

8.1.3 Evitare che Play Preview nasconda dati senza sincronizzare lo stato.

8.1.4 Aggiungere modalita' preview fullscreen futura.

### 8.2 Trigger non-export

8.2.1 `[FATTO]` Collegare `on-play` almeno al Play Preview editor.

8.2.2 `[FATTO]` Preparare `runtime-event` come dato configurabile e aggiungere Event Track outbound via `lotking:timelineevent`.

8.2.3 `[FATTO]` Aggiungere nome evento trigger.

8.2.4 `[PARZIALE]` Aggiungere comportamento: one-shot, loop, hold, restart: one-shot/repeat trigger e playback loop base sono pronti; hold/restart restano futuri.

## 9.0 Validazione e Qualita'

### 9.1 Validazione timeline

9.1.1 `[FATTO]` Camera cut senza camera.

9.1.2 Clip con durata sotto minimo.

9.1.3 `[FATTO]` Clip oltre durata studio.

9.1.4 `[FATTO]` Overlap non consentito.

9.1.5 `[PARZIALE]` Gap non consentito in modalita' continuous: il gap viene rilevato, manca ancora enforcement della modalita'.

9.1.6 `[FATTO]` Track target mancante.

### 9.2 Feedback visivo

9.2.1 `[PARZIALE]` Colori chiari per clip validi, selezionati, invalidi e muted: valid/selected/invalid/warning sono coperti, muted resta futuro.

9.2.2 `[FATTO]` Tooltip con start, end, duration, camera e note.

9.2.3 `[FATTO]` Stato camera attiva nella viewport.

9.2.4 Stato snap e fps visibile.

### 9.3 Performance

9.3.1 Evitare rebuild completo DOM a ogni frame quando non necessario.

9.3.2 Aggiornare solo playhead durante playback.

9.3.3 Ricostruire clip DOM solo quando cambiano dati timeline.

9.3.4 Preparare cache per lookup camera/target.

## 10.0 Ordine di Implementazione Consigliato

### 10.1 Primo pass: camera cut realmente editabili

10.1.1 `[FATTO]` Aggiungere pannello dettagli cut selezionato.

10.1.2 `[FATTO]` Aggiungere cambio camera per cut selezionato.

10.1.3 `[FATTO]` Aggiungere input start/duration/end.

10.1.4 `[FATTO]` Aggiungere drag corpo clip.

10.1.5 `[FATTO]` Aggiungere drag bordi trim.

10.1.6 `[FATTO]` Aggiungere snap a frame.

### 10.2 Secondo pass: timeline multi-track

10.2.1 `[FATTO]` Separare track camera cuts e object tracks.

10.2.2 `[FATTO]` Aggiungere ruler e playhead migliorati.

10.2.3 `[FATTO]` Aggiungere zoom/pan base.

10.2.4 `[FATTO]` Aggiungere marker track.

### 10.3 Terzo pass: camera/lens authoring

10.3.1 `[FATTO]` Align camera to view.

10.3.2 `[FATTO]` Align view to camera.

10.3.3 `[FATTO]` FOV keyframe.

10.3.4 Camera transform keyframe piu' puliti.

### 10.4 Quarto pass: regole avanzate

10.4.1 Continuous/free/blend mode.

10.4.2 `[FATTO]` Overlap validation.

10.4.3 Blend preview.

10.4.4 `[FATTO]` Clip invalid warnings.

### 10.5 Quinto pass: runtime trigger foundation

10.5.1 `[FATTO]` Collegare `on-play` in Play Preview.

10.5.2 `[FATTO]` Definire API interna per avviare una timeline da evento.

10.5.3 `[FATTO]` Collegare Collision Box a runtime event Cinema Studio in Play Preview.

10.5.4 Mantenere export finale fuori scope finche' la parte editor non e' stabile.

## 11.0 File Coinvolti

### 11.1 `js/editor/cinema-studio.js`

11.1.1 `[FATTO]` Timeline state.

11.1.2 `[FATTO]` Camera cut evaluation.

11.1.3 `[FATTO]` Clip selection.

11.1.4 `[FATTO]` Drag/trim.

11.1.5 `[FATTO]` Details panel logic base.

11.1.6 `[FATTO]` Validation.

### 11.2 `js/editor/editor-template.js`

11.2.1 `[FATTO]` Nuovo markup timeline.

11.2.2 `[PARZIALE]` Track list.

11.2.3 `[FATTO]` Details panel base.

11.2.4 `[FATTO]` Toolbar timeline.

### 11.3 `css/editor.css`

11.3.1 `[FATTO]` Layout timeline multi-track base.

11.3.2 `[FATTO]` Clip handles.

11.3.3 `[FATTO]` Playhead/ruler/grid base.

11.3.4 `[PARZIALE]` Stato selected/invalid/muted: selected/invalid/warning pronti, muted resta futuro.

### 11.4 `js/editor/object-inspector.js`

11.4.1 Ridurre l'inspector Cinema Studio alle impostazioni generali.

11.4.2 Rimuovere duplicazioni con timeline details.

11.4.3 Mantenere entry point rapidi.

### 11.5 `js/editor/viewport-layout.js`

11.5.1 `[FATTO]` Continuare a valutare la timeline nella viewport `timeline:`.

11.5.2 `[FATTO]` Mostrare overlay camera attiva.

11.5.3 `[PARZIALE]` Gestire fallback camera assente: invalid/warning pronti, fallback visivo completo resta futuro.

### 11.6 `js/editor/editor-runtime.js`

11.6.1 `[FATTO]` Collegare preview lifecycle.

11.6.2 `[FATTO]` Preparare trigger `on-play`.

11.6.3 `[FATTO]` Evitare conflitti tra editor preview e Play Preview.

11.6.4 `[FATTO]` Scansionare Collision Box trigger in Play Preview e avviare timeline runtime-event.

### 11.7 `js/engine/scene-store.js`

11.7.1 `[FATTO]` Normalizzazione nuovo schema.

11.7.2 `[FATTO]` Migrazione schema legacy.

11.7.3 `[PARZIALE]` Salvataggio stabile: schema e normalizzazione pronti, manca test browser round-trip documentato.

## 12.0 Cose Fuori Scope per Ora

### 12.1 Export cinematografico

12.1.1 Niente render video finale in questa fase.

12.1.2 Niente Movie Render Queue equivalente.

12.1.3 Niente pipeline ffmpeg.

### 12.2 Sequenze annidate complete

12.2.1 Preparare il modello, ma non implementare sub-sequence complete subito.

12.2.2 Niente take system completo nel primo pass.

### 12.3 Curve editor avanzato

12.3.1 Niente tangenti bezier complete nel primo pass.

12.3.2 Niente editor grafico complesso finche' keyframe/clip editing non sono stabili.

## 13.0 Criterio di Fine Lavoro

### 13.1 Cinema Studio e' usabile quando

13.1.1 `[FATTO]` Posso creare piu' camere.

13.1.2 `[FATTO]` Posso creare camera cut sulla timeline.

13.1.3 `[FATTO]` Posso scegliere quale camera appartiene a ogni cut.

13.1.4 `[FATTO]` Posso spostare, accorciare e allungare ogni cut.

13.1.5 `[FATTO]` Posso scrubbare e vedere la camera corretta.

13.1.6 `[PARZIALE]` Posso salvare, ricaricare e ritrovare la timeline identica: schema pronto, manca prova manuale browser save/reload.

13.1.7 `[FATTO]` Posso capire subito se un cut e' rotto o senza camera.

13.1.8 `[FATTO]` Posso animare almeno transform base di oggetti/camere con keyframe chiari.

13.1.9 `[FATTO]` Posso lavorare in editor senza esportare nulla.

13.1.10 `[FATTO]` Posso riusare o duplicare una timeline Cinema Studio dagli Assets senza uscire dal browser.

13.1.11 `[FATTO]` Posso usare una Collision Box per triggerare una timeline Cinema Studio durante Play Preview.
