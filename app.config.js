const variants = {
  development: {
    name: 'Streakaholic Dev',
    package: 'com.metamodernmonkey.Streakaholic.dev',
    scheme: 'streakaholic-dev',
  },
  preview: {
    name: 'Streakaholic Preview',
    package: 'com.metamodernmonkey.Streakaholic.preview',
    scheme: 'streakaholic-preview',
  },
  production: {
    name: 'Streakaholic',
    package: 'com.metamodernmonkey.Streakaholic',
    scheme: 'streakaholic',
  },
};

module.exports = ({ config }) => {
  const variantName = process.env.APP_VARIANT || 'production';
  const variant = variants[variantName];

  if (!variant) {
    throw new Error(`Unknown APP_VARIANT: ${variantName}`);
  }

  return {
    ...config,
    name: variant.name,
    scheme: variant.scheme,
    android: {
      ...config.android,
      package: variant.package,
    },
  };
};
