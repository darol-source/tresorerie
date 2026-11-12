const BASE = "/api";

export const getToken = () => localStorage.getItem("token");
export const setToken = (t) => (t ? localStorage.setItem("token", t) : localStorage.removeItem("token"));

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  if (res.status === 401 && path !== "/auth/login") {
    setToken(null);
    window.location.reload();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : `Erreur ${res.status}`);
  }
  return data;
}

export async function telecharger(path, nom) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error("Téléchargement impossible");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => v !== "" && v !== null && v !== undefined && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
