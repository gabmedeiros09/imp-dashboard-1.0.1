/**
 * SERVIDOR DE GERENCIAMENTO DE IMPRESSORAS - SEPROR/GILOG
 * 
 * Este sistema fornece:
 * - Monitoramento em tempo real de impressoras via SNMP
 * - Gerenciamento de cadastro de equipamentos
 * - API REST para integração com frontend web
 * - Geração de relatórios
 */

// =============== CONFIGURAÇÃO INICIAL ===============
const express = require('express');
const snmp = require('net-snmp'); // Para comunicação SNMP com impressoras
const cors = require('cors'); // Middleware para habilitar CORS
const bodyParser = require('body-parser'); // Para parsing de requisições JSON
const { Pool } = require('pg'); // Cliente PostgreSQL para conexão com banco
const path = require('path'); // Para manipulação de caminhos de arquivos
const ExcelJS = require('exceljs'); // Para geração de relatórios em Excel
const fs = require('fs'); // Para operações com sistema de arquivos

// Configuração do servidor Express
const app = express();
const PORT = 3000;
const HOST = '10.46.2.3'; // IP interno da rede SEPROR

// Configuração de middlewares
app.use(cors()); // Habilita CORS para todas as rotas
app.use(bodyParser.json()); // Habilita parsing de JSON no body das requisições
app.use(express.static(__dirname)); // Serve arquivos estáticos
app.use('/src', express.static(path.join(__dirname, 'src'))); // Pasta de assets

// Configuração do pool de conexões PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'controle_equipamentos',
  password: 'rorpes',
  port: 5432,
});

// =============== CONSTANTES SNMP ===============
/**
 * OIDs (Object Identifiers) padrão para monitoramento de impressoras:
 */
const TONER_OIDS = {
  black: "1.3.6.1.2.1.43.11.1.1.9.1.1",  // Toner preto
  cyan: "1.3.6.1.2.1.43.11.1.1.9.1.2",   // Toner ciano
  magenta: "1.3.6.1.2.1.43.11.1.1.9.1.3",// Toner magenta
  yellow: "1.3.6.1.2.1.43.11.1.1.9.1.4"   // Toner amarelo
};

const ERROR_OID = "1.3.6.1.2.1.25.3.5.1.1.1"; // Status da impressora
const LIFE_TAMBOR_OID = "1.3.6.1.2.1.43.11.1.1.9.1.2"; // Vida do tambor
const MAX_TAMBOR_OID = "1.3.6.1.2.1.43.11.1.1.8.1.2"; // Vida maxima do tambor
const HOSTNAME_OID = "1.3.6.1.2.1.1.5.0"; // Nome do host
const MODEL_OID = "1.3.6.1.2.1.43.5.1.1.17.1" // modelo de teste da impressora
const SERIAL_OID = "1.3.6.1.2.1.43.5.1.1.17.1" // serial number da impressora
const ERRORDETAIL_OID = "1.3.6.1.2.1.25.3.2.1.5.1" // Detalhe do erro
const CONTER_OID = "1.3.6.1.2.1.43.10.2.1.4.1.1"; // Contador de páginas


// =============== ROTAS DE INTERFACE WEB ===============
/**
 * Helper para servir páginas HTML com tratamento de erros
 * @param {string} route - Rota da URL (ex: '/dashboard')
 * @param {string} fileName - Nome do arquivo HTML (ex: 'index.html')
 */
function serveHtmlPage(route, fileName) {
  app.get(route, (req, res) => {
    const filePath = path.join(__dirname, fileName);
    
    // Verifica se arquivo existe
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`Arquivo ${fileName} não encontrado:`, err);
        return res.status(404).json({
          error: 'Página não encontrada',
          message: `O arquivo ${fileName} não foi encontrado no servidor`,
          path: filePath
        });
      }
      
      // Envia o arquivo se existir
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error(`Erro ao enviar ${fileName}:`, err);
          res.status(500).json({
            error: 'Erro ao carregar a página',
            message: `Ocorreu um erro ao carregar ${fileName}`
          });
        }
      });
    });
  });
}

// Configuração das rotas da interface web
serveHtmlPage('/dashboard', 'index.html');      // Dashboard principal
serveHtmlPage('/gmp-consulta', 'consulta.html'); // Consulta de equipamentos
serveHtmlPage('/cadastro-impressoras.html', 'cadastro-impressoras.html'); // Cadastro de impressoras

// =============== ROTAS API - TIPOS DE EQUIPAMENTOS ===============
/**
 * GET /tipos-equipamentos
 * Retorna todos os tipos de equipamentos cadastrados
 * @return {Array} Lista de tipos de equipamentos
 */
app.get('/tipos-equipamentos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_equipamentos ORDER BY nome');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar tipos de equipamentos:', err);
    res.status(500).json({
      error: 'Erro no servidor',
      details: err.message
    });
  }
});

/**
 * POST /tipos-equipamentos
 * Cria um novo tipo de equipamento
 * @param {string} nome - Nome do tipo de equipamento (obrigatório)
 * @return {Object} Tipo de equipamento criado
 */
// app.post('/tipos-equipamentos', async (req, res) => {
//   const { nome } = req.body;

//   // Validação simples
//   if (!nome) {
//     return res.status(400).json({
//       error: 'Dados inválidos',
//       message: 'Nome do tipo de equipamento é obrigatório'
//     });
//   }

//   try {
//     const result = await pool.query(
//       'INSERT INTO tipos_equipamentos (nome) VALUES ($1) RETURNING *',
//       [nome]
//     );
//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error('Erro ao cadastrar tipo de equipamento:', err);
//     res.status(500).json({
//       error: 'Erro no servidor',
//       details: err.message
//     });
//   }
// });

// =============== ROTAS API - EQUIPAMENTOS ===============
/**
 * GET /equipamentos/:id
 * Retorna um equipamento específico
 * @param {number} id - ID do equipamento
 * @return {Object} Dados do equipamento
 */
// app.get('/equipamentos/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await pool.query('SELECT * FROM equipamentos WHERE id = $1', [id]);
    
//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         error: 'Não encontrado',
//         message: 'Equipamento não encontrado'
//       });
//     }
    
//     res.status(200).json(result.rows[0]);
//   } catch (err) {
//     console.error('Erro ao buscar equipamento:', err);
//     res.status(500).json({
//       error: 'Erro no servidor',
//       details: err.message
//     });
//   }
// });

// =============== ROTAS API - IMPRESSORAS ===============
/**
 * DELETE /impressoras/:id
 * Remove uma impressora do sistema
 * @param {number} id - ID da impressora
 * @return {Object} Confirmação da exclusão
 */
app.delete('/impressoras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica se impressora existe
    const checkResult = await pool.query(
      'SELECT id FROM impressoras WHERE id = $1', 
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Impressora não encontrada',
        message: `Nenhuma impressora encontrada com o ID ${id}`
      });
    }

    // Remove a impressora
    await pool.query(
      'DELETE FROM impressoras WHERE id = $1',
      [id]
    );
    
    res.status(200).json({ 
      success: true,
      message: 'Impressora deletada com sucesso',
      deletedId: id
    });
    
  } catch (error) {
    console.error('Erro ao deletar impressora:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

/**
 * GET /toner/:ip
 * Consulta os níveis de toner e status de uma impressora
 * @param {string} ip - Endereço IP da impressora
 * @return {Object} Dados da impressora e níveis de toner
 */
app.get('/toner/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

    // Busca dados da impressora no banco
    const printerResult = await pool.query(
      'SELECT * FROM impressoras WHERE ip = $1', 
      [ip]
    );

    if (printerResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Impressora não encontrada',
        message: 'Nenhuma impressora cadastrada com este IP'
      });
    }

    // Obtém níveis de toner via SNMP
    const tonerLevels = await getTonerLevel(ip);

    // Obtém status da impressora
    let errorStatus = null;
    try {
      errorStatus = await getPrinterErrorStatus(ip);
      
    } catch (error) {
      console.error(`[PRINTER ERROR] Falha ao verificar erro da impressora ${ip}:`, error.message);
    }

    const counterPages = await getPrinterPageCount(ip);
    const serialNum = await getPrinterSerialNumber(ip)


    // Retorna todos os dados
    res.json({
  printer: printerResult.rows[0].nome,
  ip,
  toner: tonerLevels,
  isColor: printerResult.rows[0].colorida,
  status: errorStatus,
  counter: counterPages,
  serial: serialNum
});


  } catch (error) {
    res.status(500).json({
      error: 'Erro no monitoramento',
      message: 'Falha ao verificar níveis de toner',
      details: error.message
    });
  }
});

async function getPrinterPageCount(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    session.get([CONTER_OID], (error, varbinds) => {
      session.close();

      if (error) {
        console.error(`Erro ao obter contador da impressora ${ip}:`, error.message);
        return resolve(null);
      }

      const count = parseInt(varbinds[0].value.toString(), 10);
      resolve(isNaN(count) ? null : count);
    });
  });
}

async function getPrinterSerialNumber(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    session.get([SERIAL_OID], (error, varbinds) => {
      session.close();

      if (error) {
        console.error(`Erro ao obter numero de serie ${ip}:`, error.message);
        return resolve(null);
      }

      const numberSerial = varbinds[0].value.toString().trim();
      resolve(numberSerial || null);
    });
  });
}



/**
 * GET /impressoras
 * Lista todas as impressoras cadastradas
 * @return {Array} Lista de impressoras
 */
app.get('/impressoras', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM impressoras ORDER BY nome');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar impressoras:', err);
    res.status(500).json({
      error: 'Erro no servidor',
      details: err.message
    });
  }
});

/**
 * POST /impressoras
 * Cadastra uma nova impressora
 * @param {string} nome - Nome da impressora
 * @param {string} ip - Endereço IP
 * @param {boolean} colorida - Se é colorida (opcional)
 * @return {Object} Dados da impressora cadastrada
 */
app.post('/impressoras', async (req, res) => {
  const { nome, ip, colorida } = req.body;

  // Validação dos campos obrigatórios
  if (!nome || !ip) {
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Nome e IP são obrigatórios',
      required: ['nome', 'ip']
    });
  }

  try {
    // Verifica se IP já existe
    const ipExists = await pool.query(
      'SELECT id FROM impressoras WHERE ip = $1',
      [ip]
    );
    
    if (ipExists.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflito',
        message: 'Já existe uma impressora com este IP'
      });
    }

    // Insere nova impressora
    const result = await pool.query(
      `INSERT INTO impressoras (nome, ip, colorida) 
       VALUES ($1, $2, $3) RETURNING *`,
      [nome, ip, colorida || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao cadastrar impressora:', err);
    res.status(500).json({
      error: 'Erro no servidor',
      details: err.message
    });
  }
});

// =============== FUNÇÕES AUXILIARES ===============
/**
 * Obtém o status de erro da impressora via SNMP
 * @param {string} ip - Endereço IP da impressora
 * @return {Promise<string>} Status da impressora
 */

// session.get([SERIAL_OID]), (error, varbinds) => {
//       if (error) {
//         session.close();
//         console.error(`Erro ao consultar OID de erro (${ip}):`, error);
//         return reject(error);
//       }
//     }

async function getPrinterErrorStatus(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    

    session.get([ERROR_OID], (error, varbinds) => {
      if (error) {
        session.close();
        console.error(`Erro ao consultar OID de erro (${ip}):`, error);
        return reject(error);
      }

            let errorValue = varbinds[0].value.toString();

      // Se errorValue for "1", buscar detalhe
      if (errorValue === "1") {
        // Nova consulta para ERRORDETAIL_OID
        session.get([ERRORDETAIL_OID], (detailError, detailVarbinds) => {
          session.close();

          if (detailError) {
            console.error(`Erro ao consultar ERRORDETAIL_OID (${ip}):`, detailError);
            return resolve("Erro desconhecido");
          }

          const detailCode = parseInt(detailVarbinds[0].value.toString(), 10);
          switch (detailCode) {
            case 3:
              errorValue = "Sem papel";
              break;
            case 4:
              errorValue = "Obstrução de papel";
              break;
            case 5:
              errorValue = "Sem toner";
              break;
            default:
              errorValue = "Erro desconhecido";
          }

          resolve(errorValue);
        });
      } else {
        session.close();

        // Mapeamento padrão
        if (errorValue === "3") {
          errorValue = "Em Descanso";
        } else if (errorValue === "4") {
          errorValue = "Imprimindo";
        } else if (errorValue === "5") {
          errorValue = "Aquecendo";
        } else {
          errorValue = "Status desconhecido";
        }

        resolve(errorValue);
      }
    });
  });
}
async function getPrinterErrorStatus(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    

    session.get([ERROR_OID], (error, varbinds) => {
      if (error) {
        session.close();
        console.error(`Erro ao consultar OID de erro (${ip}):`, error);
        return reject(error);
      }

            let errorValue = varbinds[0].value.toString();

      // Se errorValue for "1", buscar detalhe
      if (errorValue === "1") {
        // Nova consulta para ERRORDETAIL_OID
        session.get([ERRORDETAIL_OID], (detailError, detailVarbinds) => {
          session.close();

          if (detailError) {
            console.error(`Erro ao consultar ERRORDETAIL_OID (${ip}):`, detailError);
            return resolve("Erro desconhecido");
          }

          const detailCode = parseInt(detailVarbinds[0].value.toString(), 10);
          switch (detailCode) {
            case 3:
              errorValue = "Sem papel";
              break;
            case 4:
              errorValue = "Obstrução de papel";
              break;
            case 5:
              errorValue = "Sem toner";
              break;
            default:
              errorValue = "Erro desconhecido";
          }

          resolve(errorValue);
        });
      } else {
        session.close();

        // Mapeamento padrão
        if (errorValue === "3") {
          errorValue = "Em Descanso";
        } else if (errorValue === "4") {
          errorValue = "Imprimindo";
        } else if (errorValue === "5") {
          errorValue = "Aquecendo";
        } else {
          errorValue = "Status desconhecido";
        }

        resolve(errorValue);
      }
    });
  });
}


/**
 * Obtém os níveis de toner da impressora via SNMP
 * @param {string} ip - Endereço IP da impressora
 * @return {Promise<Array>} Array com porcentagens de toner [black, cyan, magenta, yellow]
 */
async function getTonerLevel(ip) {
  return new Promise(async (resolve, reject) => {
    try {
      // Verifica no banco se a impressora é colorida
      const printerInfo = await pool.query(
        'SELECT colorida FROM impressoras WHERE ip = $1', 
        [ip]
      );

      if (printerInfo.rows.length === 0) {
        return reject(new Error('Impressora não encontrada no banco de dados'));
      }

      const isColor = printerInfo.rows[0].colorida;
      
      // Cria sessão SNMP
      const session = snmp.createSession(ip, "public", {
        timeout: 3000,
        retries: 1
      });

      // Define quais OIDs serão consultados
      const oids = [
        TONER_OIDS.black,        
        TONER_OIDS.cyan, 
        TONER_OIDS.magenta,
        TONER_OIDS.yellow
      ];

      // Executa consulta SNMP
      session.get(oids, (error, varbinds) => {
        session.close();
        
        if (error) {
          return reject(error);
        }

        // Processa os valores retornados
        const levels = varbinds.map((vb, index) => {
          const value = parseInt(vb.value.toString(), 10);
          
          // Define capacidade máxima baseada no tipo de impressora e cor
          let maxCapacity;
          
          if (isColor) {
            // Valores específicos para impressoras coloridas
            if (index === 1) { // magenta
              maxCapacity = 3500;
            } else if (index === 0) { // ciano
              maxCapacity = 3500;
            } else if (index === 2) { // amarelo
              maxCapacity = 3500;
            } else if (index === 3) { // preto
              maxCapacity = 6000;
            }
          } else {
            // Impressora monocromática
            maxCapacity = 15000;
          }
          
          // Calcula porcentagem (limitada entre 0 e 100)
          return Math.min(100, Math.max(0, Math.round((value / maxCapacity) * 100)));
        });

        resolve(levels);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// =============== INICIALIZAÇÃO DO SERVIDOR ===============
// Lista de arquivos essenciais que devem existir
const requiredFiles = [
  'index.html',
  'cadastro.html',
  'consulta.html',
  'cadastro-impressoras.html'
];

// Verifica se todos os arquivos essenciais existem
requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Arquivo essencial não encontrado: ${file}`);
    } else {
      console.log(`Arquivo ${file} encontrado`);
    }
  });
});

console.log("\nTestando consulta SNMP para obter modelo da impressora...");

const testIP = "10.46.6.11"; // IP fixo para teste
const session = snmp.createSession(testIP, "public", {
  timeout: 3000,
  retries: 1
});

session.get([MODEL_OID], (error, varbinds) => {
  session.close();
  
  if (error) {
    console.error(`Falha ao consultar modelo da impressora ${testIP}:`, error);
    return;
  }
  
  const model = varbinds[0].value.toString();
  console.log(`\n
  RESULTADO DO TESTE:
  IP: ${testIP}
  Modelo: ${model}
  OID: ${MODEL_OID}\n`);
});

// Inicia o servidor
app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
});

