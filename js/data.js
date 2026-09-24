// Liste d'origine des élus : [nom, fonction]
const DEFAULT_ELUS = [
  ["Michel LAFONT", "Maire de Thue et Mue"],
  ["Laurence TROLET", "1ère Maire déléguée de Bretteville-l'Orgueilleuse et maire adjointe à l'urbanisme"],
  ["Mickaël LHOTELLIER", "2ème Maire délégué du Mesnil-Patry et maire adjoint à la relation avec les agriculteurs"],
  ["Myriam LETELLIER", "3ème Maire déléguée de Cheux et maire adjointe aux finances"],
  ["Cyril AUBERT-GEOFFROY", "4ème Maire délégué de Sainte-Croix-Grand-Tonne et maire adjoint à l'administration générale et aux ressources humaines"],
  ["Cécile PARENT", "5ème Maire déléguée de Brouay et maire adjointe à la vie associative et municipale"],
  ["Christian DESCAMPS-WIEL", "6ème Maire délégué de Putot-en-Bessin et maire adjoint à l'événementiel"],
  ["Agnès SOLT", "7ème Maire adjointe aux affaires sociales (Bretteville-l'Orgueilleuse)"],
  ["Noémie FOIN", "Rapporteure générale à l'éducation, enfance jeunesse (Cheux)"],
  ["Muriel GAGER", "Rapporteure générale à la communication institutionnelle (Le Mesnil-Patry)"],
  ["Mathilde LEJEUNE", "Rapporteure générale à la culture et valorisation de l'action municipale (Sainte-Croix-Grand-Tonne)"],
  ["Thierry PITEL", "Rapporteur général à la maintenance et aux travaux (Le Mesnil-Patry)"],
  ["Dominique ZANNIER", "Rapporteur général à l'environnement (Bretteville-l'Orgueilleuse)"],
  ["Jocelyne COUE DA SILVA", "Conseillère municipale déléguée à l'accompagnement de la maire déléguée de Brouay et relation avec la Communauté Urbaine sur l'environnement (Brouay)"],
  ["Céline SARRAZIN", "Conseillère municipale déléguée à l'accompagnement du maire délégué de Putot-en-Bessin et soutien à la vie associative et municipale (Putot-en-Bessin)"],
  ["Daniel LE DAUPHIN", "Conseiller municipal délégué aux bâtiments et équipements (Bretteville-l'Orgueilleuse)"],
  ["Ludovic ARNAL", "Conseiller municipal délégué à la relation avec les commerces et au développement numérique (Bretteville-l'Orgueilleuse)"],
  ["Eddy LENAS", "Conseiller municipal délégué à la relation avec les entreprises (Bretteville-l'Orgueilleuse)"],
  ["Jean-Louis DANOIS", "Maire adjoint au maire déléguée (Bretteville-l'Orgueilleuse)"],
  ["Nathalie TESSON", "Maire adjointe au maire déléguée et au patrimoine (Bretteville-l'Orgueilleuse)"],
  ["Michel GLINEL", "Maire adjoint au maire déléguée (Cheux)"],
  ["Véronique HULMEL", "Conseillère municipale (Bretteville-l'Orgueilleuse)"],
  ["Sandrine MALCAPE", "Conseillère municipale (Bretteville-l'Orgueilleuse)"],
  ["Ludovic HAUZAY", "Conseiller municipal (Bretteville-l'Orgueilleuse)"],
  ["Valérie BEAUSOLEIL", "Conseillère municipale (Cheux)"],
  ["Mathieu LEBEL", "Conseiller municipal (Cheux)"],
  ["Franck DE SERRE DE SAINT ROMAN", "Conseiller municipal (Bretteville-l'Orgueilleuse)"],
  ["Caroline ROUSSEL", "Conseillère municipale (Bretteville-l'Orgueilleuse)"],
  ["François BOREANIZ", "Conseiller municipal (Cheux)"],
  ["Céline SALLIOT", "Conseillère municipale (Putot-en-Bessin)"],
  ["Pascal VALLERAND", "Conseiller municipal (Cheux)"],
  ["Flavie HERPIN", "Conseillère municipale (Bretteville-l'Orgueilleuse)"],
  ["Lucie ROUILLAY", "Conseillère municipale (Bretteville-l'Orgueilleuse)"],
];
// Choix de vote possibles (libellés dans i18n.js)
const CHOIX = ["pour", "contre", "abst", "npp"];

// Clé de stockage des données dans le navigateur
const KEY = "vote-cm-v1";
