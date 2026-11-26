import next from 'eslint-config-next';

const config = [...next, { ignores: ['.next/**', 'node_modules/**', 'desktop/**'] }];

export default config;
