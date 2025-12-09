import chalk from 'chalk';

export const logger = {
  title: (text) => {
    console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
    console.log(chalk.bold.cyan(`  📚 ${text}`));
    console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
  },

  section: (text) => {
    console.log('\n' + chalk.bold.yellow(`▸ ${text}`));
    console.log(chalk.dim('─'.repeat(40)));
  },

  info: (text) => {
    console.log(chalk.blue('ℹ ') + text);
  },

  success: (text) => {
    console.log(chalk.green('✔ ') + text);
  },

  warning: (text) => {
    console.log(chalk.yellow('⚠ ') + text);
  },

  error: (text) => {
    console.log(chalk.red('✖ ') + text);
  },

  file: (filename, action = '') => {
    const actionText = action ? chalk.dim(` → ${action}`) : '';
    console.log(chalk.gray('  •') + ` ${chalk.white(filename)}${actionText}`);
  },

  folder: (folderName, count) => {
    console.log(chalk.magenta(`  📁 ${folderName}`) + chalk.dim(` (${count} files)`));
  },

  divider: () => {
    console.log(chalk.dim('─'.repeat(40)));
  },

  newline: () => {
    console.log('');
  },

  stats: (label, value) => {
    console.log(chalk.gray(`  ${label}: `) + chalk.bold.white(value));
  },

  preview: (source, destination) => {
    console.log(chalk.gray('    ') + chalk.dim(source));
    console.log(chalk.gray('    ') + chalk.green('→ ') + chalk.cyan(destination));
  }
};

