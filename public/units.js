// lb/kg conversion. The API always speaks kg; pages convert with these helpers only.
// Loads as window.Units in the browser and via require() in Node (tests, route validation).
(() => {
  const KG_PER_LB = 0.45359237;
  const WEIGHT_UNITS = ['lb', 'kg'];

  const isWeightUnit = (u) => WEIGHT_UNITS.includes(u);

  function checkUnit(unit) {
    if (!isWeightUnit(unit)) throw new TypeError(`Unknown weight unit: ${unit}`);
  }

  const round = (x, places) => Math.round(x * 10 ** places) / 10 ** places;

  // Blank or non-numeric input (an empty field, a reps-only set) means "no weight", not 0
  function toNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function toKg(value, unit) {
    checkUnit(unit);
    const n = toNumber(value);
    if (n === null) return null;
    return round(unit === 'lb' ? n * KG_PER_LB : n, 3);
  }

  function fromKg(kg, unit) {
    checkUnit(unit);
    const n = toNumber(kg);
    if (n === null) return null;
    return round(unit === 'lb' ? n / KG_PER_LB : n, 1);
  }

  function formatWeight(kg, unit) {
    const v = fromKg(kg, unit);
    return v === null ? '' : `${v} ${unit}`;
  }

  const Units = { WEIGHT_UNITS, isWeightUnit, toKg, fromKg, formatWeight };
  if (typeof module === 'object' && module.exports) module.exports = Units;
  else window.Units = Units;
})();
