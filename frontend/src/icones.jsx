const P = {
  tableau: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  assistant: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></>,
  rapports: <><path d="M4 20V4M4 20h16" /><rect x="8" y="12" width="3" height="5" /><rect x="14" y="8" width="3" height="9" /></>,
  mouvements: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  validations: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  transferts: <><path d="M4 8h14M14 4l4 4-4 4" /><path d="M20 16H6M10 12l-4 4 4 4" /></>,
  factures: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h8" /></>,
  comptes: <><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z" /><circle cx="16" cy="14" r="1" /></>,
  categories: <><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  tiers: <><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  budgets: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4" /></>,
  previsions: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  rapprochement: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  utilisateurs: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  cloche: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  fermer: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  recherche: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  telecharger: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  sortie: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  alerte: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  crayon: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  cle: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  envoyer: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  trombone: <path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />,
  portefeuille: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  flecheHaut: <path d="M12 19V5M6 11l6-6 6 6" />,
  flecheBas: <path d="M12 5v14M6 13l6 6 6-6" />,
  balance: <><path d="M12 3v18M5 21h14M5 7h14" /><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" /></>,
};

export const Icone = ({ nom, taille = 18 }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {P[nom] || null}
  </svg>
);
