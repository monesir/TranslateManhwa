const GLOBAL_TEXT_STYLE_PRESETS = [
  {
    id: "text_preset_global_normal_dialogue",
    name: "Normal Dialogue",
    kind: "dialogue",
    style: {
      color: "#17110B",
      fontFamily: "JF Flat",
      fontSize: 18,
      fontWeight: 800,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.28,
      maxLines: null,
      paddingX: 5,
      paddingY: 4,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_black_bubble",
    name: "Black Bubble",
    kind: "dialogue",
    style: {
      color: "#F7F2E8",
      fontFamily: "JF Flat",
      fontSize: 18,
      fontWeight: 800,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.28,
      maxLines: null,
      paddingX: 5,
      paddingY: 4,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_narration_box",
    name: "Narration Box",
    kind: "narration",
    style: {
      color: "#17110B",
      fontFamily: "JF Flat",
      fontSize: 17,
      fontWeight: 800,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.24,
      maxLines: null,
      paddingX: 8,
      paddingY: 6,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: {
      background: {
        color: "#F7F2E8",
        enabled: false,
        opacity: 1,
        paddingX: 8,
        paddingY: 6,
        radius: 2,
      },
    },
  },
  {
    id: "text_preset_global_small_aside",
    name: "Small Aside",
    kind: "aside",
    style: {
      color: "#17110B",
      fontFamily: "JF Flat",
      fontSize: 14,
      fontWeight: 800,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.22,
      maxLines: null,
      paddingX: 4,
      paddingY: 3,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_shout",
    name: "Shout",
    kind: "shout",
    style: {
      color: "#111111",
      fontFamily: "JF Flat",
      fontSize: 22,
      fontWeight: 900,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.18,
      maxLines: null,
      paddingX: 5,
      paddingY: 4,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_whisper",
    name: "Whisper",
    kind: "whisper",
    style: {
      color: "#2C2722",
      fontFamily: "JF Flat",
      fontSize: 15,
      fontWeight: 700,
      opacity: 0.92,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.26,
      maxLines: null,
      paddingX: 5,
      paddingY: 4,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_sign_text",
    name: "Sign Text",
    kind: "sign",
    style: {
      color: "#17110B",
      fontFamily: "JF Flat",
      fontSize: 18,
      fontWeight: 800,
      opacity: 1,
    },
    layout: {
      allowWordBreak: false,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.2,
      maxLines: null,
      paddingX: 4,
      paddingY: 3,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: null,
  },
  {
    id: "text_preset_global_sfx_basic",
    name: "SFX Basic",
    kind: "sfx",
    style: {
      color: "#111111",
      fontFamily: "JF Flat",
      fontSize: 24,
      fontWeight: 900,
      opacity: 1,
      stroke: {
        color: "#FFFFFF",
        enabled: true,
        opacity: 1,
        width: 2,
      },
    },
    layout: {
      allowWordBreak: true,
      align: "center",
      direction: "auto",
      fitMode: "shrink_to_fit",
      lineHeight: 1.12,
      maxLines: null,
      paddingX: 4,
      paddingY: 4,
      rotation: 0,
      verticalAlign: "middle",
      wrapMode: "word",
    },
    effects: {
      stroke: {
        color: "#FFFFFF",
        enabled: true,
        opacity: 1,
        width: 2,
      },
    },
  },
];

function seedTextStylePresets(db) {
  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'text_style_presets'
  `).get();
  if (!table) return;

  const timestamp = new Date().toISOString();
  const insertPreset = db.prepare(`
    INSERT OR IGNORE INTO text_style_presets (
      id, project_id, name, kind, style_json, layout_json, effect_json, is_default, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (const preset of GLOBAL_TEXT_STYLE_PRESETS) {
    insertPreset.run(
      preset.id,
      preset.name,
      preset.kind,
      JSON.stringify(preset.style),
      JSON.stringify(preset.layout),
      preset.effects ? JSON.stringify(preset.effects) : null,
      timestamp,
      timestamp,
    );
  }
}

function seedDatabase(db) {
  seedTextStylePresets(db);
}

module.exports = {
  GLOBAL_TEXT_STYLE_PRESETS,
  seedDatabase,
};
