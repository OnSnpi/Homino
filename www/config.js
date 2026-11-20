window.Homino = window.Homino || {};

(function (ns) {
  const CONSTANTS = {
    PROFILE_KEY: 'homino_profile_permanent',
    BOARD_KEY: 'homino_board_current',
    LEGACY_KEYS: [
      'homino_save_v12', 'homino_save_v11', 'homino_save_v10',
      'homino_save_v9', 'homino_save_v8', 'homino_save_v7',
      'homino_save_v6', 'homino_save_v5'
    ],
    MILESTONE_EMERALD: 5,
    MILESTONE_TOUR: 10,
    MILESTONE_SYMBOLS: 15,
    MILESTONE_PIPS: 20,
    MILESTONE_ROYAL: 30
  };

  // Vzory pro clenitou desku ('X' = blokovana dira, '.' = aktivni pole)
  // Kazda sablona ma presne overenou sachovnicovou paritu a souvislost pro 100% dlazditelnost dominem
  const SHAPED_TEMPLATES = {
    5: [
      // 1. Ctyri rohy + stred (3 suda, 2 licha)
      [
        'X...X',
        '.....',
        '..X..',
        '.....',
        'X...X'
      ],
      // 2. Sikme vyrezy po stranach + stred
      [
        'X..X.',
        '.....',
        '..X..',
        '.....',
        '.X..X'
      ],
      // 3. Kriz uprostred
      [
        '..X..',
        '.....',
        'X.X.X',
        '.....',
        '..X..'
      ],
      // 4. Vetrnik / asymetricke ostruvky
      [
        '.X..X',
        '.....',
        '..X..',
        '.....',
        'X..X.'
      ],
      // 5. Dva rohove bloky (2x1) + stred
      [
        'XX...',
        '.....',
        '..X..',
        '.....',
        '...XX'
      ],
      // 6. Vnitrni prstenec / prekazky
      [
        '.....',
        '.X...',
        '..X.X',
        '.X...',
        '....X'
      ]
    ],
    6: [
      // 1. Stredovy blok 3x2 (3 suda, 3 licha)
      [
        '......',
        '......',
        '..XX..',
        '..XX..',
        '..XX..',
        '......'
      ],
      // 2. Rohove vyrezy
      [
        'XX..XX',
        '......',
        '......',
        '......',
        '......',
        'XX....'
      ],
      // 3. Vnitrni symetricke body
      [
        '......',
        '.X..X.',
        '......',
        '......',
        '.X..X.',
        '......'
      ],
      // 4. Brana a stred
      [
        'X....X',
        '......',
        '..XX..',
        '..XX..',
        '......',
        '......'
      ],
      // 5. Dve sikme lavky
      [
        '......',
        '.XX...',
        '.X....',
        '....X.',
        '...XX.',
        '......'
      ],
      // 6. Podkova / zaliv
      [
        '..XX..',
        '..XX..',
        '......',
        '......',
        '......',
        'X....X'
      ]
    ],
    7: [
      // 1. Prstenec s branou (4 suda, 3 licha)
      [
        '.......',
        '..X.X..',
        '.......',
        '.X.X.X.',
        '.......',
        '..X.X..',
        '.......'
      ],
      // 2. Rohove sloupy a stredova osa
      [
        'XX...XX',
        '.......',
        '...X...',
        '.......',
        '...X...',
        '.......',
        '...X...'
      ],
      // 3. Stredovy diamant / kosoctverec
      [
        '.......',
        '...X...',
        '..X.X..',
        '.X.X.X.',
        '..X.X..',
        '.......',
        '.......'
      ],
      // 4. Rohy + vnitrni kridla
      [
        'X.....X',
        '.......',
        '..X.X..',
        '...X...',
        '..X.X..',
        '.......',
        '.......'
      ],
      // 5. Sikme dvojice + stred
      [
        'XX.....',
        '.......',
        '.......',
        '...X...',
        '.......',
        '.......',
        'XX...XX'
      ],
      // 6. Ctyri vnitrni ostrovy + rohove body
      [
        'X.....X',
        '.......',
        '.X...X.',
        '.......',
        '.X...X.',
        '.......',
        '...X...'
      ]
    ],
    8: [
      // 1. Stredovy kriz (4 suda, 4 licha)
      [
        '........',
        '........',
        '...XX...',
        '..XXXX..',
        '...XX...',
        '........',
        '........',
        '........'
      ],
      // 2. Osekane rohy (osmiuhelnik)
      [
        'XX....XX',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        'XX....XX'
      ],
      // 3. Vnitrni ctverce a stred
      [
        '........',
        '.XX..XX.',
        '........',
        '...XX...',
        '...XX...',
        '........',
        '........',
        '........'
      ],
      // 4. Bocni brany / presypaci hodiny
      [
        '........',
        '........',
        'XX....XX',
        'XX....XX',
        '........',
        '........',
        '........',
        '........'
      ],
      // 5. Dva vnitrni bloky 2x2
      [
        '........',
        '........',
        '..XX....',
        '..XX....',
        '....XX..',
        '....XX..',
        '........',
        '........'
      ],
      // 6. Symetricke pilire
      [
        '........',
        '..X..X..',
        '........',
        '.XX..XX.',
        '........',
        '..X..X..',
        '........',
        '........'
      ]
    ]
  };

  const I18N = {
    cs: {
      rotateTitle: 'Oto\u010d za\u0159\u00edzen\u00ed na v\u00fd\u0161ku',
      rotateSub: 'Hra Homino je navr\u017eena pro hran\u00ed na v\u00fd\u0161ku.',
      winsLabel: 'V\u00fdhry:',
      deckLabel: 'Sada:',
      undo: 'Zp\u011bt',
      rules: 'N\u00e1vod',
      hint: 'Rada',
      newGame: 'Nov\u00e1 hra',
      ngTitle: 'Nov\u00e1 hra',
      ngDealNew: 'Rozdat novou partii',
      ngRestartSame: '\u21bb Hr\u00e1t tuto partii od za\u010d\u00e1tku',
      ngCancel: 'Zru\u0161it',
      confirmNewTitle: 'Ukon\u010dit rozehranou hru?',
      confirmNewDesc: 'M\u00e1\u0161 rozehranou partii. Opravdu ji chce\u0161 ukon\u010dit a rozdat novou?',
      confirmCancel: 'Pokra\u010dovat v h\u0159e',
      confirmOkNew: 'Ano, nov\u00e1 hra',
      trialStartBtn: '\u270e Zkusit',
      trialAcceptBtn: '\u2713 Potvrdit',
      trialDiscardBtn: '\u2715 Zahodit',
      statusTrialActive: 'Re\u017eim zkou\u0161ky: pokusn\u00e9 tahy jsou \u010d\u00e1rkovan\u00e9.',
      statusTrialAccepted: 'Pokusn\u00e9 tahy potvrzeny jako jist\u00e9.',
      statusTrialDiscarded: 'Pokus zahozen, n\u00e1vrat na rozcest\u00ed.',
      statusRestarted: 'Partie byla rozd\u00e1na znovu od za\u010d\u00e1tku.',
      statusStart: 'Klepnut\u00edm ozna\u010d okraj, p\u0159ejet\u00edm spoj domino.',
      statusStartUnique: 'Zad\u00e1n\u00ed s jedin\u00fdm \u0159e\u0161en\u00edm \u2013 v\u0161e lze vy\u0159e\u0161it logikou.',
      statusResume: 'Pokra\u010duje\u0161 v rozehran\u00e9 h\u0159e.',
      statusFinishedLocked: 'Partie je dokon\u010dena. Spus\u0165 novou hru.',
      statusAutoFormed: 'Ohrani\u010den\u00e1 dvojice se automaticky spojila v domino!',
      statusXray: 'Hodnota {val}: zapojeno {used}/{total} (zb\u00fdv\u00e1 {left})',
      statusFilterPlacedFound: 'K\u00e1men {pair} je polo\u017een \u2013 zv\u00fdrazn\u011bny neodd\u011blen\u00e9 dvojice ({count}).',
      statusFilterPlacedClean: 'K\u00e1men {pair} je polo\u017een a v\u0161echny ostatn\u00ed v\u00fdskyty jsou odd\u011blen\u00e9.',
      adviceSingleNeighbor: 'Pol\u00ed\u010dko m\u00e1 jedin\u00e9ho voln\u00e9ho souseda \u2013 mus\u00ed vzniknout {pair}. (2. klepnut\u00ed spoj\u00ed)',
      adviceHiddenSingle: 'K\u00e1men {pair} m\u00e1 na cel\u00e9 plo\u0161e u\u017e jen toto jedin\u00e9 m\u00edsto. (2. klepnut\u00ed spoj\u00ed)',
      adviceDuplicateWall: 'K\u00e1men {pair} u\u017e le\u017e\u00ed jinde \u2013 tady mus\u00ed b\u00fdt st\u011bna. (2. klepnut\u00ed odd\u011bl\u00ed)',
      adviceFallbackEdge: 'Tady je v\u00edce mo\u017enost\u00ed \u2013 ozna\u010dena jedna spr\u00e1vn\u00e1 hrana. (2. klepnut\u00ed dopln\u00ed)',
      adviceAppliedLink: 'Logick\u00fd krok proveden: spojen k\u00e1men {pair}.',
      adviceAppliedWall: 'Logick\u00fd krok proveden: dopln\u011bna okrajov\u00e1 st\u011bna.',
      statusHintErrDup: 'Chyba: K\u00e1men {pair} u\u017e na plo\u0161e le\u017e\u00ed v\u00edcekr\u00e1t!',
      statusHintErrWall: 'Chyba: Zv\u00fdrazn\u011bn\u00fd okraj p\u0159e\u0159ez\u00e1v\u00e1 platn\u00e9 domino.',
      statusHintErrDead: 'Chyba: Zv\u00fdrazn\u011bn\u00e9 pol\u00ed\u010dko nem\u00e1 \u017e\u00e1dn\u00e9ho souseda.',
      statusErrDup: 'Pozor, k\u00e1men {pair} u\u017e v sad\u011b jednou le\u017e\u00ed!',
      statusErrDead: 'Pozor, n\u011bkter\u00e9 pol\u00ed\u010dko z\u016fstalo zcela izolovan\u00e9!',
      statusWinMaster: 'Mistrovsk\u00e9 v\u00edt\u011bzstv\u00ed! V\u0161ech {total} kamen\u016f je na m\u00edst\u011b.',
      statusWinTrain: 'Skv\u011bl\u00e1 pr\u00e1ce! Sada {setLabel} je kompletn\u00ed.',
      statusUnlock5: 'Odem\u010den bonus za 5 v\u00fdher: Smaragdov\u00fd st\u016fl!',
      statusUnlock10: 'Odem\u010den bonus za 10 v\u00fdher: Turnajov\u00e9 barvy!',
      statusUnlock15: 'Odem\u010den bonus za 15 v\u00fdher: Symboly z Diffequa!',
      statusUnlock20: 'Odem\u010den bonus za 20 v\u00fdher: Dominov\u00e9 te\u010dky!',
      statusUnlock30: 'Odem\u010den bonus za 30 v\u00fdher: Kr\u00e1lovsk\u00e1 zlat\u00e1 edice!',
      statusStatsReset: 'Statistika v\u00fdher byla vynulov\u00e1na.',
      endBadgeMaster: 'MISTROVSK\u00c1 SADA {setLabel}',
      endTitleMaster: 'Mistrovsk\u00fd v\u00fdkon!',
      endDescMaster: 'Dokon\u010dil jsi kompletn\u00ed mistrovskou sadu {total} kamen\u016f domina do posledn\u00edho kusu.',
      endBadgeStandard: 'SADA {setLabel} DOKON\u010cENA',
      endTitleStandard: 'Konec kola \u2013 v\u00fdhra!',
      endDescStandard: 'V\u0161ech {total} kamen\u016f domina v sad\u011b {setLabel} je spr\u00e1vn\u011b spojen\u00fdch.',
      endStatBoard: 'Nalezeno kamen\u016f',
      endStatMasterWins: 'Mistrovsk\u00e9 v\u00fdhry',
      endStatSetWins: 'V\u00fdhry v sad\u011b {setLabel}',
      endBtnView: 'Plocha',
      endBtnAgain: 'Hr\u00e1t znovu',
      setTitle: 'Nastaven\u00ed hry',
      setLangLabel: 'Jazyk / Language',
      setAvLabel: 'Zvuky a vibrace',
      soundOn: '\uD83D\uDD0A Zvuky: Zap.',
      soundOff: '\uD83D\uDD07 Zvuky: Vyp.',
      hapticsOn: '\uD83D\uDCF3 Vibrace: Zap.',
      hapticsOff: '\uD83D\uDCF4 Vibrace: Vyp.',
      setDiffLabel: 'Velikost sady (Obt\u00ed\u017enost)',
      setShapeLabel: 'Tvar desky',
      shapeRect: 'Obd\u00e9ln\u00edk',
      shapeShaped: '\u010clenit\u00e1',
      setGenLabel: 'Typ zad\u00e1n\u00ed',
      genClassic: 'Klasick\u00e9',
      genUnique: '\u010cist\u00e1 logika (1 \u0159e\u0161en\u00ed)',
      setThemeLabel: 'Barevn\u00fd motiv',
      setDisplayLabel: 'Zobrazen\u00ed hodnot',
      tileClassic: 'Klasick\u00fd',
      tileEmerald: 'Smaragdov\u00fd',
      tileTour: 'Turnajov\u00fd',
      tileRoyal: 'Kr\u00e1lovsk\u00fd',
      tileDigits: '\u010c\u00edslice',
      tileLetters: 'P\u00edsmena',
      tileSymbols: 'Symboly',
      tilePips: 'Te\u010dky',
      subBase: 'Z\u00e1kladn\u00ed',
      subUnlocked: 'Odem\u010deno',
      subLock5: '5 v\u00fdher',
      subLock10: '10 v\u00fdher',
      subLock15: '15 v\u00fdher',
      subLock20: '20 v\u00fdher',
      subLock30: '30 v\u00fdher',
      setUnlockInfo: '<strong>Odemknut\u00ed bonus\u016f (mistrovsk\u00e9 sady 1\u20136 a 0\u20136):</strong> 5 v\u00fdher = <strong>Smaragdov\u00fd st\u016fl</strong>, 10 = <strong>Turnajov\u00fd</strong>, 15 = <strong>Symboly Diffequa</strong>, 20 = <strong>Te\u010dky</strong>, 30 = <strong>Kr\u00e1lovsk\u00e1 zlat\u00e1 edice</strong>.',
      saveAndClose: 'Ulo\u017eit a zav\u0159\u00edt',
      rulesHTML: `
        <h2 class="modal-title-center">Jak hr\u00e1t Homino</h2>
        <p class="rules-intro">C\u00edlem hry je rozd\u011blit m\u0159\u00ed\u017eku na kompletn\u00ed sadu <strong>unik\u00e1tn\u00edch kamen\u016f domina</strong> (21 kamen\u016f v sad\u011b 1\u20136 nebo 28 kamen\u016f ve velk\u00e9 sad\u011b 0\u20136).</p>
        <p class="rules-intro"><strong>Ovl\u00e1d\u00e1n\u00ed a n\u00e1stroje:</strong></p>
        <div class="rules-box-gray">
          <ul>
            <li><strong>Klepnut\u00ed na hranu:</strong> nakresl\u00ed nebo sma\u017ee okrajovou \u010d\u00e1ru mezi dv\u011bma pol\u00ed\u010dky.</li>
            <li><strong>Pota\u017een\u00ed prstem (swipe):</strong> p\u0159eje\u010f z jednoho pol\u00ed\u010dka na sousedn\u00ed pro okam\u017eit\u00e9 spojen\u00ed (nebo zru\u0161en\u00ed) domina.</li>
            <li><strong>Podr\u017een\u00ed pol\u00ed\u010dka:</strong> dlouh\u00fdm stiskem na hodnot\u011b se na desce podsv\u00edt\u00ed v\u0161echny stejn\u00e9 znaky a naho\u0159e uvid\u00ed\u0161, kolik jich zb\u00fdv\u00e1.</li>
            <li><strong>Chytr\u00fd filtr dole:</strong> klepnut\u00edm na k\u00e1men dole se zv\u00fdrazn\u00ed voln\u00e1 m\u00edsta (u ji\u017e nalezen\u00e9ho kamene ozna\u010d\u00ed p\u0159ehl\u00e9dnut\u00e9 d\u011blic\u00ed \u010d\u00e1ry).</li>
            <li><strong>Rada:</strong> 1. klepnut\u00ed najde a vysv\u011btl\u00ed logick\u00fd krok; 2. klepnut\u00ed ho provede.</li>
            <li><strong>Re\u017eim zkou\u0161ky (\u270e Zkusit):</strong> na rozcest\u00ed ulo\u017e\u00ed jist\u00fd stav; dal\u0161\u00ed tahy jsou \u010d\u00e1rkovan\u00e9 a lze je <strong>potvrdit</strong> nebo <strong>zahodit</strong>.</li>
          </ul>
        </div>
        <p class="rules-intro"><strong>Zlat\u00e9 pravidlo:</strong> Ka\u017ed\u00e1 dvojice hodnot sm\u00ed b\u00fdt v cel\u00e9 m\u0159\u00ed\u017ece pou\u017eita <strong>pouze jednou</strong>.</p>
        <div class="rules-box-green">
          <strong class="green-title">Automatick\u00e9 uzav\u0159en\u00ed kostky:</strong>
          Jakmile postupn\u00fdm o\u0165uk\u00e1v\u00e1n\u00edm ohrani\u010d\u00ed\u0161 dvojici sousedn\u00edch pol\u00ed\u010dek v\u0161emi 6 vn\u011bj\u0161\u00edmi hranami, kostka domina se <strong>sama automaticky spoj\u00ed</strong> a od\u0161krtne v p\u0159ehledu dole.
        </div>
        <p class="rules-warn"><strong>Pozor:</strong> Pokud vytvo\u0159\u00ed\u0161 stejn\u00fd k\u00e1men dvakr\u00e1t nebo n\u011bkter\u00e9 pol\u00ed\u010dko zcela od\u0159\u00edzne\u0161 od okol\u00ed, hra t\u011b okam\u017eit\u011b upozorn\u00ed!</p>
        <p class="rules-rewards"><strong>Odm\u011bny:</strong> V\u00fdhry v mistrovsk\u00fdch sad\u00e1ch 1\u20136 a 0\u20136 se s\u010d\u00edtaj\u00ed a odemykaj\u00ed Smaragdov\u00fd st\u016fl (5), Turnajov\u00fd motiv (10), Symboly Diffequa (15), Te\u010dky (20) a Kr\u00e1lovskou zlatou edici (30).</p>
        <button class="btn-modal-full" id="btn-close-rules">Rozum\u00edm, hr\u00e1t</button>
        <div class="author-footer">&copy; 2026 Ondrandy</div>
      `
    },
    en: {
      rotateTitle: 'Rotate device to portrait',
      rotateSub: 'Homino is designed to be played in portrait mode.',
      winsLabel: 'Wins:',
      deckLabel: 'Deck:',
      undo: 'Undo',
      rules: 'Rules',
      hint: 'Tip',
      newGame: 'New Game',
      ngTitle: 'New Game',
      ngDealNew: 'Deal New Puzzle',
      ngRestartSame: '\u21bb Replay This Puzzle from Start',
      ngCancel: 'Cancel',
      confirmNewTitle: 'Abandon current game?',
      confirmNewDesc: 'You have a game in progress. Do you really want to end it and deal a new one?',
      confirmCancel: 'Keep Playing',
      confirmOkNew: 'Yes, New Game',
      trialStartBtn: '\u270e Try',
      trialAcceptBtn: '\u2713 Keep',
      trialDiscardBtn: '\u2715 Drop',
      statusTrialActive: 'Trial mode: tentative moves are dashed.',
      statusTrialAccepted: 'Tentative moves confirmed.',
      statusTrialDiscarded: 'Trial dropped, returned to checkpoint.',
      statusRestarted: 'Puzzle restarted from the beginning.',
      statusStart: 'Tap an edge to draw a border, swipe across two cells to link.',
      statusStartUnique: 'Unique solution puzzle \u2013 solvable purely by logic.',
      statusResume: 'Continuing saved game.',
      statusFinishedLocked: 'Game completed. Start a new game.',
      statusAutoFormed: 'Surrounded pair automatically locked into a domino!',
      statusXray: 'Value {val}: linked {used}/{total} ({left} left)',
      statusFilterPlacedFound: 'Domino {pair} is placed \u2013 unseparated duplicates highlighted ({count}).',
      statusFilterPlacedClean: 'Domino {pair} is placed and all other pairs are separated.',
      adviceSingleNeighbor: 'Cell has only 1 open neighbor \u2013 must form {pair}. (Tap again to link)',
      adviceHiddenSingle: 'Domino {pair} only fits in this single spot. (Tap again to link)',
      adviceDuplicateWall: 'Domino {pair} is already used \u2013 border required here. (Tap again to split)',
      adviceFallbackEdge: 'Multiple branches here \u2013 one true edge highlighted. (Tap again to draw)',
      adviceAppliedLink: 'Logical step applied: linked {pair}.',
      adviceAppliedWall: 'Logical step applied: border added.',
      statusHintErrDup: 'Mistake: Domino {pair} is placed more than once!',
      statusHintErrWall: 'Mistake: Highlighted border cuts through a valid domino.',
      statusHintErrDead: 'Mistake: Highlighted cell has no available neighbor.',
      statusErrDup: 'Duplicate alert: Domino {pair} is already used!',
      statusErrDead: 'Warning: A cell has been completely isolated!',
      statusWinMaster: 'Master Victory! All {total} dominoes are in place.',
      statusWinTrain: 'Great job! Set {setLabel} completed.',
      statusUnlock5: '5-Win Bonus Unlocked: Emerald Table!',
      statusUnlock10: '10-Win Bonus Unlocked: Tournament Colors!',
      statusUnlock15: '15-Win Bonus Unlocked: Diffequa Symbols!',
      statusUnlock20: '20-Win Bonus Unlocked: Domino Pips!',
      statusUnlock30: '30-Win Bonus Unlocked: Royal Gold Edition!',
      statusStatsReset: 'Win statistics have been reset.',
      endBadgeMaster: 'MASTER SET {setLabel}',
      endTitleMaster: 'Master Performance!',
      endDescMaster: 'You partitioned the entire grid into all {total} unique dominoes.',
      endBadgeStandard: 'SET {setLabel} COMPLETED',
      endTitleStandard: 'Round Complete!',
      endDescStandard: 'All {total} unique dominoes in set {setLabel} are locked in.',
      endStatBoard: 'Dominoes Found',
      endStatMasterWins: 'Master Wins',
      endStatSetWins: 'Set {setLabel} Wins',
      endBtnView: 'View Board',
      endBtnAgain: 'Play Again',
      setTitle: 'Game Settings',
      setLangLabel: 'Jazyk / Language',
      setAvLabel: 'Sound & Haptics',
      soundOn: '\uD83D\uDD0A Sound: On',
      soundOff: '\uD83D\uDD07 Sound: Off',
      hapticsOn: '\uD83D\uDCF3 Haptics: On',
      hapticsOff: '\uD83D\uDCF4 Haptics: Off',
      setDiffLabel: 'Set Size (Difficulty)',
      setShapeLabel: 'Board Shape',
      shapeRect: 'Rectangle',
      shapeShaped: 'Shaped',
      setGenLabel: 'Puzzle Mode',
      genClassic: 'Classic',
      genUnique: 'Pure Logic (1 Solution)',
      setThemeLabel: 'Color Theme',
      setDisplayLabel: 'Value Display',
      tileClassic: 'Classic',
      tileEmerald: 'Emerald',
      tileTour: 'Tournament',
      tileRoyal: 'Royal Gold',
      tileDigits: 'Digits',
      tileLetters: 'Letters',
      tileSymbols: 'Symbols',
      tilePips: 'Pips',
      subBase: 'Default',
      subUnlocked: 'Unlocked',
      subLock5: '5 wins',
      subLock10: '10 wins',
      subLock15: '15 wins',
      subLock20: '20 wins',
      subLock30: '30 wins',
      setUnlockInfo: '<strong>Unlock Bonuses (1\u20136 & 0\u20136 Master sets):</strong> 5 wins = <strong>Emerald Table</strong>, 10 = <strong>Tournament</strong>, 15 = <strong>Diffequa Symbols</strong>, 20 = <strong>Pips</strong>, 30 = <strong>Royal Gold Edition</strong>.',
      saveAndClose: 'Save & Close',
      rulesHTML: `
        <h2 class="modal-title-center">How to Play Homino</h2>
        <p class="rules-intro">Partition the grid into a complete set of <strong>unique dominoes</strong> (21 dominoes in set 1\u20136 or 28 dominoes in the large 0\u20136 set).</p>
        <p class="rules-intro"><strong>Controls & Tools:</strong></p>
        <div class="rules-box-gray">
          <ul>
            <li><strong>Tap an edge:</strong> draws or removes a border line between two cells.</li>
            <li><strong>Swipe across cells:</strong> drag from one cell to an adjacent cell to link (or unlink) a domino.</li>
            <li><strong>Press & hold a cell:</strong> highlights all matching values on the board and shows how many remain.</li>
            <li><strong>Smart tray filter:</strong> tap any domino below to highlight open spots, or tap a crossed-out domino to highlight missed divider lines.</li>
            <li><strong>Tip:</strong> 1st tap highlights & explains a logical step; 2nd tap applies it.</li>
            <li><strong>Trial mode (\u270e Try):</strong> saves a checkpoint; subsequent moves appear dashed and can be <strong>kept</strong> or <strong>dropped</strong>.</li>
          </ul>
        </div>
        <p class="rules-intro"><strong>Golden Rule:</strong> Every value pair may appear <strong>only once</strong> on the entire board.</p>
        <div class="rules-box-green">
          <strong class="green-title">Auto-completion:</strong>
          Surrounding any adjacent pair of cells with all 6 outer borders automatically locks them into a domino and checks it off below.
        </div>
        <p class="rules-warn"><strong>Watch out:</strong> Placing the same domino twice or isolating a single cell triggers an immediate warning!</p>
        <p class="rules-rewards"><strong>Rewards:</strong> Master wins across sets 1\u20136 and 0\u20136 combine to unlock Emerald Table (5), Tournament Colors (10), Diffequa Symbols (15), Domino Pips (20), and Royal Gold Edition (30).</p>
        <button class="btn-modal-full" id="btn-close-rules">Got it, play</button>
        <div class="author-footer">&copy; 2026 Ondrandy</div>
      `
    }
  };

  function detectLang() {
    const nav = (navigator.language || 'en').toLowerCase();
    return (nav.startsWith('cs') || nav.startsWith('sk')) ? 'cs' : 'en';
  }

  function valueToLetter(val, diffMode) {
    if (diffMode === 7) return ['A', 'B', 'C', 'D', 'E', 'F', 'G'][val] || '';
    return ['', 'A', 'B', 'C', 'D', 'E', 'F'][val] || '';
  }

  function getValueRange(diffMode) {
    if (diffMode === 7) return { minVal: 0, maxVal: 6 };
    return { minVal: 1, maxVal: diffMode };
  }

  function getSetLabel(diffMode) {
    if (diffMode === 7) return '0\u20136';
    return `1\u2013${diffMode}`;
  }

  function getTotalDominoCount(diffMode) {
    return (diffMode * (diffMode + 1)) / 2;
  }

  function createPipHTML(val) {
    if (val === 0) return '';
    const map = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8]
    };
    const active = new Set(map[val] || []);
    let html = '<div class="pip-grid">';
    for (let i = 0; i < 9; i++) {
      html += active.has(i) ? '<span class="pip"></span>' : '<span></span>';
    }
    html += '</div>';
    return html;
  }

  function createSymbolSVG(val, sizePx = null, withFill = false) {
    const styleAttr = sizePx ? `width="${sizePx}" height="${sizePx}"` : `class="sym-icon"`;
    const sw = sizePx ? '2.8' : '2.6';
    const fillAttr = withFill ? `fill="currentColor" fill-opacity="0.22"` : `fill="none"`;
    switch (val) {
      case 0:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><path d="M12 20.5C12 20.5 4 15.2 4 9.2C4 6.5 6.1 4.5 8.6 4.5C10.2 4.5 11.4 5.3 12 6.4C12.6 5.3 13.8 4.5 15.4 4.5C17.9 4.5 20 6.5 20 9.2C20 15.2 12 20.5 12 20.5Z"/></svg>`;
      case 1:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}"><circle cx="12" cy="12" r="7.5"/></svg>`;
      case 2:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
      case 3:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><polygon points="12,4.5 20,18.5 4,18.5"/></svg>`;
      case 4:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><polygon points="12,3.5 20.5,12 12,20.5 3.5,12"/></svg>`;
      case 5:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><polygon points="12,3.5 14.6,9 20.5,9.7 16.1,13.8 17.3,19.6 12,16.7 6.7,19.6 7.9,13.8 3.5,9.7 9.4,9"/></svg>`;
      case 6:
      default:
        return `<svg ${styleAttr} viewBox="0 0 24 24" ${fillAttr} stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"><polygon points="12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8"/></svg>`;
    }
  }

  ns.Config = {
    CONSTANTS,
    SHAPED_TEMPLATES,
    I18N,
    detectLang,
    valueToLetter,
    getValueRange,
    getSetLabel,
    getTotalDominoCount,
    createPipHTML,
    createSymbolSVG
  };
})(window.Homino);
