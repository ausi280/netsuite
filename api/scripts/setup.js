const chalk = require('chalk');
const { execSync } = require('child_process');

function runSetup() {
  try {

    const env = process.env.NODE_ENV || 'development';

    console.log(chalk.bold.cyan(`Iniciando configuración del proyecto en modo: ${env.toUpperCase()}`));
    console.log(chalk.blue('\n[1/2] Instalando dependencias...'));

    execSync('npm install', { stdio: 'inherit' });

    console.log(chalk.blue('\n[2/2] Ejecutando migraciones de base de datos...'));

    try {

      execSync('npx knex migrate:latest --env ${env}', { stdio: 'inherit' });
      execSync('npx knex seed:run --env ${env}', { stdio: 'inherit' });

    } catch (dbError) {

      console.error(chalk.red('\nOcurrió un error en la migración:'));
      console.error(chalk.gray(dbError.message));
      process.exit(1); 

    }

    console.log(chalk.bold.green('\nProyecto configurado correctamente.'));

  } catch (error) {

    console.error(chalk.bgRed.white.bold('\n ERROR '), chalk.red('Ocurrió un error inesperado durante el setup:'));
    console.error(chalk.gray(error.message));
    process.exit(1);

  }
}

runSetup();