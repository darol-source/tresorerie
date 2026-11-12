export default function Modal({ titre, onClose, onSubmit, err, children, libelleOk = "Enregistrer" }) {
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>{titre}</h2>
        <div className="fields">{children}</div>
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ marginTop: 16, marginBottom: 0 }}>
          <button className="btn">{libelleOk}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </form>
    </div>
  );
}

export const Champ = ({ label, full, children }) => (
  <label className={full ? "full" : ""}>{label}{children}</label>
);
