// fetch-midterms-data.js
// Récupère les données de SnoutCounter (Hackquantumcpp/snoutcounter-backend)
// — generic ballot (Démocrates vs Républicains) et approbation de Trump —
// calcule un instantané compact, et écrit public/midterms.json.
// Zéro dépendance externe — Node 18+ (fetch natif).

const fs = require("fs");
const path = require("path");

const BASE = "https://raw.githubusercontent.com/Hackquantumcpp/snoutcounter-backend/main";
const URL_BALLOT_MOYENNE = `${BASE}/averages/generic_ballot.csv`;
const URL_BALLOT_BRUT = `${BASE}/data/generic_ballot_polls.csv`;
const URL_APPROBATION_MOYENNE = `${BASE}/averages/presidential_gen_approval.csv`;

// Élection de mi-mandat 2026 : mardi suivant le premier lundi de novembre.
const JOUR_ELECTION = "2026-11-03";

// --- Parseur CSV minimal (gère les champs entre guillemets avec virgules) ---
function parseCSV(texte) {
  const lignes = texte.trim().split("\n");
  const entetes = splitLigneCSV(lignes[0]);
  return lignes.slice(1).map((ligne) => {
    const valeurs = splitLigneCSV(ligne);
    const obj = {};
    entetes.forEach((h, i) => (obj[h] = valeurs[i]));
    return obj;
  });
}

function splitLigneCSV(ligne) {
  const champs = [];
  let cur = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
    } else if (c === "," && !dansGuillemets) {
      champs.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  champs.push(cur);
  return champs;
}

function joursAvant(cible) {
  const a = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const b = new Date(cible + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

async function recupererCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Échec récupération ${url}: HTTP ${res.status}`);
  return parseCSV(await res.text());
}

// --- Ballot : dernier point de la moyenne glissante -----------------------
function calculerBallotActuel(moyenne) {
  const dernier = moyenne[moyenne.length - 1];
  const dem = Math.round(parseFloat(dernier.dem) * 10) / 10;
  const rep = Math.round(parseFloat(dernier.rep) * 10) / 10;
  return {
    date: dernier.end_date,
    dem,
    rep,
    net: Math.round(parseFloat(dernier.net) * 10) / 10,
    autres: Math.round((100 - dem - rep) * 10) / 10,
  };
}

// --- Tendance : échantillonnage de la moyenne sur ~180 jours, points SVG --
function calculerTendanceBallot(moyenne) {
  const FENETRE_JOURS = 180;
  const derniers = moyenne.slice(-FENETRE_JOURS);
  const PAS = Math.max(1, Math.floor(derniers.length / 16)); // ~16 points
  const echantillon = derniers.filter((_, i) => i % PAS === 0);
  if (echantillon[echantillon.length - 1] !== derniers[derniers.length - 1]) {
    echantillon.push(derniers[derniers.length - 1]);
  }

  const LARGEUR = 700;
  const HAUTEUR = 320;
  const MARGE_X = 10;
  const MARGE_DROITE = 160;
  const MARGE_Y = 16;
  const n = echantillon.length;

  const valeurs = [];
  echantillon.forEach((p) => {
    valeurs.push(parseFloat(p.dem), parseFloat(p.rep));
  });
  const minV = Math.floor(Math.min(...valeurs) - 1.5);
  const maxV = Math.ceil(Math.max(...valeurs) + 1.5);

  const xFor = (i) => MARGE_X + (i * (LARGEUR - MARGE_DROITE - MARGE_X)) / (n - 1);
  const yFor = (v) => HAUTEUR - MARGE_Y - ((v - minV) / (maxV - minV)) * (HAUTEUR - 2 * MARGE_Y);

  function serie(champ, style) {
    const pts = echantillon.map((p, i) => `${xFor(i).toFixed(1)},${yFor(parseFloat(p[champ])).toFixed(1)}`);
    const derniereVal = parseFloat(echantillon[echantillon.length - 1][champ]);
    return {
      points: pts.join(" "),
      style,
      derniere_valeur: Math.round(derniereVal * 10) / 10,
      derniere_x: xFor(n - 1).toFixed(1),
      point_y: yFor(derniereVal).toFixed(1),
    };
  }

  const serieDem = serie("dem", "plein");
  const serieRep = serie("rep", "tirets");

  // Écarte les étiquettes si elles se chevauchent (scores proches)
  const ECART_MIN = 26;
  let yDem = parseFloat(serieDem.point_y);
  let yRep = parseFloat(serieRep.point_y);
  if (Math.abs(yDem - yRep) < ECART_MIN) {
    if (yDem < yRep) {
      yRep = yDem + ECART_MIN;
    } else {
      yDem = yRep + ECART_MIN;
    }
  }
  serieDem.label_y = yDem.toFixed(1);
  serieRep.label_y = yRep.toFixed(1);

  return {
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    date_debut: echantillon[0].end_date,
    date_fin: echantillon[echantillon.length - 1].end_date,
    dem: serieDem,
    rep: serieRep,
  };
}

// --- Comparatif instituts : dernier sondage de chaque institut ------------
// Exclut les sondages "partisans" (commandités par un parti), comme le fait
// SnoutCounter lui-même dans sa méthodologie.
function calculerComparatifInstituts(bruts, max) {
  const neutres = bruts.filter((p) => p.partisan !== "DEM" && p.partisan !== "REP" && p.pollster);
  const parInstitut = {};
  neutres.forEach((p) => {
    const cur = parInstitut[p.pollster];
    if (!cur || p.end_date > cur.end_date) {
      parInstitut[p.pollster] = p;
    }
  });
  return Object.values(parInstitut)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))
    .slice(0, max)
    .map((p) => ({
      institut: p.pollster,
      date: p.end_date,
      dem: parseFloat(p.dem),
      rep: parseFloat(p.rep),
    }));
}

// --- Approbation de Trump : dernier point de la moyenne --------------------
function calculerApprobationActuelle(moyenne) {
  const dernier = moyenne[moyenne.length - 1];
  const approuve = Math.round(parseFloat(dernier.approve) * 10) / 10;
  const desapprouve = Math.round(parseFloat(dernier.disapprove) * 10) / 10;
  return {
    date: dernier.end_date,
    approuve,
    desapprouve,
    net: Math.round(parseFloat(dernier.net) * 10) / 10,
    sans_avis: Math.round((100 - approuve - desapprouve) * 10) / 10,
  };
}

async function main() {
  const [moyenneBallot, brutsBallot, moyenneApprobation] = await Promise.all([
    recupererCSV(URL_BALLOT_MOYENNE),
    recupererCSV(URL_BALLOT_BRUT),
    recupererCSV(URL_APPROBATION_MOYENNE),
  ]);

  const out = {
    genere_le: new Date().toISOString(),
    election: {
      jour_election: JOUR_ELECTION,
      jours_avant: joursAvant(JOUR_ELECTION),
    },
    ballot_actuel: calculerBallotActuel(moyenneBallot),
    tendance_ballot: calculerTendanceBallot(moyenneBallot),
    comparatif_instituts: calculerComparatifInstituts(brutsBallot, 6),
    approbation_actuelle: calculerApprobationActuelle(moyenneApprobation),
    // Résultats officiels : structure prête, à remplir le soir du scrutin
    // une fois une source fiable identifiée (pas d'équivalent SnoutCounter
    // pour les résultats — voir README).
    resultats_ballot: null,
  };

  const outDir = path.join(__dirname, "..", "public");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "midterms.json");

  const nouveauContenu = JSON.stringify(out, null, 2);
  const ancienContenu = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
  const ancienSansDate = ancienContenu ? ancienContenu.replace(/"genere_le":.*\n/, "") : null;
  const nouveauSansDate = nouveauContenu.replace(/"genere_le":.*\n/, "");

  if (ancienSansDate === nouveauSansDate) {
    console.log("Aucun changement de fond — on met quand même à jour l'horodatage.");
  } else {
    console.log(`Nouvelles données détectées — ballot ${out.ballot_actuel.dem}D/${out.ballot_actuel.rep}R.`);
  }
  fs.writeFileSync(outPath, nouveauContenu);
  console.log(`Écrit dans ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
