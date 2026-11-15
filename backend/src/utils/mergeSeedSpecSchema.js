const specsUtil = require('./specs');

function mergeSeedSpecSchema(existingGroups, seedGroups) {
  const merged = specsUtil.normalizeSpecGroups(existingGroups);

  for (const seedGroup of seedGroups) {
    let group = merged.find(
      (item) => item.key === seedGroup.key || item.label.toLowerCase() === seedGroup.label.toLowerCase()
    );
    if (!group) {
      merged.push({ ...seedGroup, fields: seedGroup.fields.map((field) => ({ ...field })) });
      continue;
    }

    group.label = seedGroup.label;
    group.labelBn = seedGroup.labelBn;

    for (const seedField of seedGroup.fields) {
      const current = group.fields.find(
        (field) => field.key === seedField.key || field.label.toLowerCase() === seedField.label.toLowerCase()
      );
      if (!current) {
        group.fields.push({ ...seedField, order: group.fields.length });
        continue;
      }

      Object.assign(current, seedField, {
        key: current.key,
        order: current.order,
        options: [...new Set([...(seedField.options || []), ...(current.options || [])])].slice(0, 60),
        aliases: { ...(seedField.aliases || {}), ...(current.aliases || {}) },
        required: current.required || seedField.required,
        repeatable: current.repeatable || seedField.repeatable,
        showOnCard: current.showOnCard || seedField.showOnCard,
        icon: current.icon || seedField.icon,
        unit: current.unit || seedField.unit,
        defaultValue: current.defaultValue !== '' && current.defaultValue !== null && current.defaultValue !== undefined
          ? current.defaultValue
          : seedField.defaultValue,
      });
    }
  }

  return specsUtil.normalizeSpecGroups(merged);
}

module.exports = { mergeSeedSpecSchema };
