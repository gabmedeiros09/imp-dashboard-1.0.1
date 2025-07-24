const express = require('express');
const snmp = require('net-snmp');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

// =============== CONFIGURAÇÃO INICIAL ===============
const configPath = path.join(__dirname, 'config.json');
let config = {
  host: 'localhost',
  port: 3000,
  defaultHost: 'localhost',
  defaultPort: 3000
};

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.log('Usando configurações padrão');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/src', express.static(path.join(__dirname, 'src')));

// Configuração do PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'controle_equipamentos',
  password: 'rorpes',
  port: 5432,
});

// =============== CONSTANTES SNMP ===============
const TONER_OIDS = {
  black: "1.3.6.1.2.1.43.11.1.1.9.1.1",
  cyan: "1.3.6.1.2.1.43.11.1.1.9.1.2",
  magenta: "1.3.6.1.2.1.43.11.1.1.9.1.3",
  yellow: "1.3.6.1.2.1.43.11.1.1.9.1.4"
};

const ERROR_OID = "1.3.6.1.2.1.25.3.5.1.1.1";
const ERRORDETAIL_OID1_MONO = "1.3.6.1.2.1.43.18.1.1.8.1.1";
const ERRORDETAIL_OID2_MONO = "1.3.6.1.2.1.43.18.1.1.8.1.2";
const ERRORDETAIL_OID3_MONO = "1.3.6.1.2.1.43.18.1.1.8.1.3";
const ERRORDETAIL_OID1_COLOR = "1.3.6.1.2.1.43.18.1.1.8.1.135";
const ERRORDETAIL_OID2_COLOR = "1.3.6.1.2.1.43.18.1.1.8.1.136";
const ERRORDETAIL_OID3_COLOR = "1.3.6.1.2.1.43.18.1.1.8.1.137";
const LIFE_TAMBOR_OID = "1.3.6.1.2.1.43.11.1.1.9.1.2";
const MAX_TAMBOR_OID = "1.3.6.1.2.1.43.11.1.1.8.1.2";
const HOSTNAME_OID = "1.3.6.1.2.1.1.5.0";
const MODEL_OID = "1.3.6.1.2.1.43.5.1.1.17.1";
const SERIAL_OID = "1.3.6.1.2.1.43.5.1.1.17.1";
const ERRORDETAIL_OID = "1.3.6.1.2.1.25.3.2.1.5.1";
const CONTER_OID = "1.3.6.1.2.1.43.10.2.1.4.1.1";

// =============== ROTAS DE INTERFACE WEB ===============
function serveHtmlPage(route, fileName) {
  app.get(route, (req, res) => {
    const filePath = path.join(__dirname, fileName);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error(`Arquivo ${fileName} não encontrado:`, err);
        return res.status(404).json({
          error: 'Página não encontrada',
          message: `O arquivo ${fileName} não foi encontrado no servidor`,
          path: filePath
        });
      }
      
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

serveHtmlPage('/dashboard', 'index.html');
serveHtmlPage('/gmp-consulta', 'consulta.html');
serveHtmlPage('/cadastro-impressoras.html', 'cadastro-impressoras.html');
serveHtmlPage('/config', 'config.html');

// =============== ROTAS API - CONFIGURAÇÕES ===============
app.post('/api/config', express.json(), (req, res) => {
  const { host, port } = req.body;
  
  if (!host || !port) {
    return res.status(400).json({ error: 'Host e porta são obrigatórios' });
  }

  const newConfig = {
    ...config,
    host,
    port: parseInt(port)
  };

  fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), (err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
    
    config = newConfig;
    res.json({ 
      success: true,
      message: 'Configurações atualizadas. Reinicie o servidor para aplicar as mudanças.'
    });
  });
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

// =============== ROTAS API - IMPRESSORAS ===============
app.delete('/impressoras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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

    await pool.query('DELETE FROM impressoras WHERE id = $1', [id]);
    
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

app.get('/toner/:ip', async (req, res) => {
  try {
    const { ip } = req.params;

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

    const isColor = printerResult.rows[0].colorida;
    const tonerLevels = await getTonerLevel(ip);
    const drumCurrent = await getDrumCurrentLife(ip);
    const drumMax = await getDrumMaxLife(ip);
    const drumPercent = drumCurrent && drumMax ? Math.round((drumCurrent / drumMax) * 100) : null;

    let errorStatus = null;
    let errorDetails = ["N/A", "N/A", "N/A"];
    
    try {
      errorStatus = await getPrinterErrorStatus(ip);
      errorDetails = await getPrinterErrorDetails(ip, isColor);
    } catch (error) {
      console.error(`[PRINTER ERROR] Falha ao verificar erro da impressora ${ip}:`, error.message);
    }

    const counterPages = await getPrinterPageCount(ip);
    const serialNum = await getPrinterSerialNumber(ip);

    res.json({
      printer: printerResult.rows[0].nome,
      ip,
      toner: tonerLevels,
      isColor,
      status: errorStatus,
      errorDetails: errorDetails,
      counter: counterPages,
      serial: serialNum,
      drum: {
        current: drumCurrent,
        max: drumMax,
        percent: drumPercent
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Erro no monitoramento',
      message: 'Falha ao verificar níveis de toner',
      details: error.message
    });
  }
});

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

app.post('/impressoras', async (req, res) => {
  const { nome, ip, colorida } = req.body;

  if (!nome || !ip) {
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Nome e IP são obrigatórios',
      required: ['nome', 'ip']
    });
  }

  try {
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

      if (errorValue === "1") {
        session.get([ERRORDETAIL_OID], (detailError, detailVarbinds) => {
          session.close();

          if (detailError) {
            console.error(`Erro ao consultar ERRORDETAIL_OID (${ip}):`, detailError);
            return resolve("Erro desconhecido");
          }

          const detailCode = parseInt(detailVarbinds[0].value.toString(), 10);
          switch (detailCode) {
            case 3: errorValue = "Sem papel"; break;
            case 4: errorValue = "Obstrução de papel"; break;
            case 5: errorValue = "Sem toner"; break;
            default: errorValue = "Erro desconhecido";
          }

          resolve(errorValue);
        });
      } else {
        session.close();

        if (errorValue === "3") errorValue = "Em Descanso";
        else if (errorValue === "4") errorValue = "Imprimindo";
        else if (errorValue === "5") errorValue = "Aquecendo";
        else errorValue = "Status desconhecido";

        resolve(errorValue);
      }
    });
  });
}

async function getPrinterErrorDetails(ip, isColor) {
  const errorDetails = ["N/A", "N/A", "N/A"];
  const oids = isColor ? [
    ERRORDETAIL_OID1_COLOR,
    ERRORDETAIL_OID2_COLOR,
    ERRORDETAIL_OID3_COLOR
  ] : [
    ERRORDETAIL_OID1_MONO,
    ERRORDETAIL_OID2_MONO,
    ERRORDETAIL_OID3_MONO
  ];

  try {
    errorDetails[0] = (await snmpGetSingle(ip, oids[0])) || "N/A";
    errorDetails[1] = (await snmpGetSingle(ip, oids[1])) || "N/A";
    errorDetails[2] = (await snmpGetSingle(ip, oids[2])) || "N/A";
  } catch (e) {
    
  }

  return errorDetails;
}

function snmpGetSingle(ip, oid) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    session.get([oid], (error, varbinds) => {
      session.close();
      if (error) return reject(error);
      const value = varbinds[0].value.toString().trim();
      resolve(value === "" ? "Nenhum erro" : value);
    });
  });
}

async function getDrumCurrentLife(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    session.get([LIFE_TAMBOR_OID], (error, varbinds) => {
      session.close();
      if (error) {
        console.error(`Erro ao obter vida do tambor ${ip}:`, error.message);
        return resolve(null);
      }
      const life = parseInt(varbinds[0].value.toString(), 10);
      resolve(isNaN(life) ? null : life);
    });
  });
}

async function getDrumMaxLife(ip) {
  return new Promise((resolve, reject) => {
    const session = snmp.createSession(ip, "public", {
      timeout: 3000,
      retries: 1
    });

    session.get([MAX_TAMBOR_OID], (error, varbinds) => {
      session.close();
      if (error) {
        console.error(`Erro ao obter vida máxima do tambor ${ip}:`, error.message);
        return resolve(null);
      }
      const maxLife = parseInt(varbinds[0].value.toString(), 10);
      resolve(isNaN(maxLife) ? null : maxLife);
    });
  });
}

async function getTonerLevel(ip) {
  return new Promise(async (resolve, reject) => {
    try {
      const printerInfo = await pool.query(
        'SELECT colorida FROM impressoras WHERE ip = $1', 
        [ip]
      );

      if (printerInfo.rows.length === 0) {
        return reject(new Error('Impressora não encontrada no banco de dados'));
      }

      const isColor = printerInfo.rows[0].colorida;
      const session = snmp.createSession(ip, "public", {
        timeout: 3000,
        retries: 1
      });

      const oids = [
        TONER_OIDS.black,        
        TONER_OIDS.cyan, 
        TONER_OIDS.magenta,
        TONER_OIDS.yellow
      ];

      session.get(oids, (error, varbinds) => {
        session.close();
        if (error) return reject(error);

        const levels = varbinds.map((vb, index) => {
          const value = parseInt(vb.value.toString(), 10);
          let maxCapacity;
          
          if (isColor) {
            if (index === 1) maxCapacity = 3500;
            else if (index === 0) maxCapacity = 3500;
            else if (index === 2) maxCapacity = 3500;
            else if (index === 3) maxCapacity = 6000;
          } else {
            maxCapacity = 15000;
          }
          
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
const requiredFiles = [
  'index.html',
  'cadastro.html',
  'consulta.html',
  'cadastro-impressoras.html',
  'config.html'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Arquivo essencial não encontrado: ${file}`);
    }
  });
});

app.listen(config.port, config.host, () => {
  console.log(`Servidor rodando em http://${config.host}:${config.port}`);
});