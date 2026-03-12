const manifest = {
  pluginId: 'dexter-crypto',
  toolIds: ['dexter_crypto_search', 'dexter_protocol_metrics'],
  bundledSkillDirectories: ['../../src/skills'],
};

console.log(JSON.stringify(manifest, null, 2));
