// Horloge injectable : permet de tester les délais, baux et péremptions sans attendre.
export const horloge = {
  decalageMs: 0,
  maintenant() {
    return Date.now() + this.decalageMs;
  },
  iso() {
    return new Date(this.maintenant()).toISOString();
  },
  reinitialiser() {
    this.decalageMs = 0;
  },
};
