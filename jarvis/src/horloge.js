// Horloge injectable : permet de tester délais, baux et péremptions de façon déterministe.
export const horloge = {
  decalageMs: 0,
  gele: null, // si défini : instant figé (ms) auquel s'ajoute le décalage
  maintenant() {
    return (this.gele ?? Date.now()) + this.decalageMs;
  },
  iso() {
    return new Date(this.maintenant()).toISOString();
  },
  aujourdhui() {
    return this.iso().slice(0, 10);
  },
  reinitialiser() {
    this.decalageMs = 0;
    this.gele = null;
  },
};
