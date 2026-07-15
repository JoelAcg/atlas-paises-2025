/** Config del modo guerra en tiempo real */
window.GuerraConfig = {
  MAX_PLAYERS: 6,
  TICK_MS: 250,
  // segundos por “unidad de distancia” (grados lat/lon ≈ 111km)
  MOVE_SEC_PER_DEG: 8,
  MOVE_MIN_SEC: 4,
  MOVE_MAX_SEC: 90,
  COMBAT_TICK_SEC: 1.2,
  INCOME_INTERVAL_SEC: 8,
  RESEARCH_BASE_SEC: 25,

  COLORS: [
    "#3b82f6", "#ef4444", "#22c55e", "#eab308",
    "#a855f7", "#06b6d4", "#f97316", "#ec4899",
  ],

  UNITS: {
    infanteria: {
      name: "Infantería",
      atk: 10,
      def: 12,
      speed: 1,
      cost: 40,
      manpower: 100,
      icon: "🪖",
    },
    tanque: {
      name: "Tanque",
      atk: 28,
      def: 22,
      speed: 1.4,
      cost: 180,
      manpower: 40,
      icon: "🛡️",
    },
    avion: {
      name: "Avión",
      atk: 35,
      def: 8,
      speed: 2.2,
      cost: 250,
      manpower: 20,
      icon: "✈️",
    },
  },

  BUILDINGS: {
    cuartel: {
      name: "Cuartel",
      cost: 200,
      produces: { infanteria: 2 },
      intervalSec: 12,
      icon: "🏰",
    },
    fabrica: {
      name: "Fábrica militar",
      cost: 400,
      produces: { tanque: 1 },
      intervalSec: 20,
      icon: "🏭",
    },
    aerodromo: {
      name: "Aeródromo",
      cost: 550,
      produces: { avion: 1 },
      intervalSec: 28,
      icon: "🛫",
    },
    banco: {
      name: "Banco",
      cost: 250,
      moneyPerTick: 35,
      intervalSec: 8,
      icon: "🏦",
    },
    universidad: {
      name: "Universidad",
      cost: 450,
      researchBonus: 0.25,
      icon: "🎓",
    },
    muralla: {
      name: "Muralla",
      cost: 300,
      defBonus: 0.35,
      icon: "🧱",
    },
  },

  TECHS: {
    armas: {
      name: "Armas mejoradas",
      cost: 120,
      timeSec: 30,
      effect: { atkMul: 0.15 },
    },
    blindaje: {
      name: "Blindaje",
      cost: 150,
      timeSec: 35,
      effect: { defMul: 0.2 },
    },
    industria: {
      name: "Industria de guerra",
      cost: 180,
      timeSec: 40,
      effect: { costMul: -0.15, incomeMul: 0.2 },
    },
    logistica: {
      name: "Logística",
      cost: 140,
      timeSec: 32,
      effect: { speedMul: 0.25 },
    },
    aviacion: {
      name: "Doctrina aérea",
      cost: 200,
      timeSec: 45,
      effect: { airAtkMul: 0.3 },
    },
  },

  START: {
    money: 800,
    manpower: 5000,
    unitsAtCapital: { infanteria: 40, tanque: 5, avion: 2 },
  },
};
