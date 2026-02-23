const express = require('express');
const snmp = require('net-snmp');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// =============== CONFIGURAÇÃO INICIAL ===============
const configPath = path.join(__dirname, 'config.json');
const printersPath = path.join(__dirname, 'printers.json');
const oidsPath = path.join(__dirname, 'oids.json');
const knowledgePath = path.join(__dirname, 'knowledge.json');

let config = {
  host: '0.0.0.0',
  port: 3000,
  defaultHost: '0.0.0.0',
  defaultPort: 3000
};

// Carregar configurações
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.log('Usando configurações padrão');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Inicializar arquivo de impressoras se não existir
if (!fs.existsSync(printersPath)) {
  fs.writeFileSync(printersPath, JSON.stringify([], null, 2));
}

// Inicializar arquivo de OIDs se não existir
if (!fs.existsSync(oidsPath)) {
  fs.writeFileSync(oidsPath, JSON.stringify({}, null, 2));
}

// Inicializar arquivo de conhecimento se não existir
if (!fs.existsSync(knowledgePath)) {
  const initialKnowledge = {
    articles: [
      {
        id: 1,
        title: "Bem-vindo à Biblioteca de Conhecimento",
        category: "it",
        categoryName: "TI e Infraestrutura",
        steps: "<h3>Como usar a biblioteca de conhecimento:</h3><ol><li>Navegue pelas categorias ou use a busca</li><li>Clique em qualquer artigo para ver detalhes</li><li>Use o formulário 'Adicionar Conteúdo' para contribuir</li><li>Compartilhe suas soluções com a equipe</li></ol>",
        tags: ["inicio", "guia", "ajuda"],
        date: new Date().toLocaleDateString('pt-BR'),
        views: 0
      }
    ]
  };
  fs.writeFileSync(knowledgePath, JSON.stringify(initialKnowledge, null, 2));
}

// Função para sanitizar HTML (proteção básica)
function sanitizeHTML(html) {
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/src', express.static(path.join(__dirname, 'src')));

// =============== FUNÇÕES PARA MANIPULAR ARQUIVOS JSON ===============

// Funções para impressoras
function readPrinters() {
  try {
    const data = fs.readFileSync(printersPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler arquivo de impressoras:', error);
    return [];
  }
}

function writePrinters(printers) {
  try {
    fs.writeFileSync(printersPath, JSON.stringify(printers, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao escrever no arquivo de impressoras:', error);
    return false;
  }
}

// Funções para base de conhecimento
function readKnowledgeBase() {
  try {
    const data = fs.readFileSync(knowledgePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao ler arquivo de conhecimento:', error);
    return { articles: [] };
  }
}

function writeKnowledgeBase(knowledge) {
  try {
    fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao escrever no arquivo de conhecimento:', error);
    return false;
  }
}

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

const verifyOids = {
  toner_black_level: "1.3.6.1.2.1.43.11.1.1.9.1.1",
  toner_cyan_level: "1.3.6.1.2.1.43.11.1.1.9.1.2",
  toner_magenta_level: "1.3.6.1.2.1.43.11.1.1.9.1.3",
  toner_yellow_level: "1.3.6.1.2.1.43.11.1.1.9.1.4",
  life_tambor: "1.3.6.1.2.1.43.11.1.1.9.1.2",
  max_tambor: "1.3.6.1.2.1.43.11.1.1.8.1.2",
  erro_status_oid: "1.3.6.1.2.1.25.3.5.1.1.1",
  erro_detail_oid: "1.3.6.1.2.1.25.3.2.1.5.1",
  mono_1: "1.3.6.1.2.1.43.18.1.1.8.1.1",
  mono_2: "1.3.6.1.2.1.43.18.1.1.8.1.2",
  mono_3: "1.3.6.1.2.1.43.18.1.1.8.1.3",
  color_1: "1.3.6.1.2.1.43.18.1.1.8.1.135",
  color_2: "1.3.6.1.2.1.43.18.1.1.8.1.136",
  color_3: "1.3.6.1.2.1.43.18.1.1.8.1.137",
  hostname_oid: "1.3.6.1.2.1.1.5.0",
  serial_oid: "1.3.6.1.2.1.43.5.1.1.17.1",
  counter_oid: "1.3.6.1.2.1.43.10.2.1.4.1.1"
};

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
serveHtmlPage('/cadastro-impressoras', 'cadastro-impressoras.html');
serveHtmlPage('/config', 'config.html');
serveHtmlPage('/oid', 'consulta-OID.html');
serveHtmlPage('/biblioteca', 'biblioteca.html');

// =============== ROTAS API - BASE DE CONHECIMENTO ===============

// Rota para obter todos os artigos
app.get('/api/knowledge', (req, res) => {
  try {
    const knowledge = readKnowledgeBase();
    res.json(knowledge.articles);
  } catch (error) {
    console.error('Erro ao carregar base de conhecimento:', error);
    res.status(500).json({ 
      error: 'Erro ao carregar base de conhecimento',
      details: error.message 
    });
  }
});

// Rota para obter um artigo específico por ID
app.get('/api/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const knowledge = readKnowledgeBase();
    const article = knowledge.articles.find(a => a.id === parseInt(id));
    
    if (!article) {
      return res.status(404).json({ 
        error: 'Artigo não encontrado',
        message: `Nenhum artigo encontrado com o ID ${id}`
      });
    }
    
    res.json(article);
  } catch (error) {
    console.error('Erro ao buscar artigo:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar artigo',
      details: error.message 
    });
  }
});

// Rota para adicionar novo artigo (VERSÃO MODIFICADA - SEM SOLUTION, APENAS STEPS)
app.post('/api/knowledge', (req, res) => {
  try {
    const { title, category, steps, tags } = req.body;
    
    if (!title || !category || !steps) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        message: 'Título, categoria e passos são obrigatórios'
      });
    }
    
    const knowledge = readKnowledgeBase();
    
    // Gerar novo ID
    const newId = knowledge.articles.length > 0 
      ? Math.max(...knowledge.articles.map(a => a.id)) + 1 
      : 1;
    
    // Mapear categoria para nome
    const categoryMap = {
      'it': 'TI e Infraestrutura',
      'network': 'Rede e Conexão',
      'printers': 'Impressoras',
      'software': 'Software',
      'procedures': 'Procedimentos',
      'security': 'Segurança',
      'other': 'Outros'
    };
    
    // Processar tags
    const processedTags = Array.isArray(tags) 
      ? tags 
      : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []);
    
    // Processar os passos
    let stepsHTML = '';
    
    console.log('Recebendo passos:', steps.substring(0, 100) + '...');
    
    // Verificar se os passos já contém tags HTML
    const hasHTMLTags = /<[a-z][\s\S]*>/i.test(steps);
    
    if (hasHTMLTags) {
      // JÁ É HTML - usar diretamente após sanitizar
      stepsHTML = sanitizeHTML(steps);
      console.log('Detectado conteúdo HTML, usando diretamente');
    } else {
      // É TEXTO SIMPLES - converter para HTML básico
      console.log('Detectado texto simples, convertendo para HTML');
      
      // Processar o texto para identificar passos
      const lines = steps.split('\n').map(line => line.trim()).filter(line => line);
      
      // Verificar se o texto segue um padrão de passos numerados
      const hasNumberedSteps = lines.some(line => /^\d+[°ªº\.\-]/.test(line));
      
      if (hasNumberedSteps) {
        // Converter passos numerados para HTML
        let inCodeBlock = false;
        let currentList = [];
        let htmlParts = [];
        
        lines.forEach(line => {
          // Detectar início de bloco de código
          if (line.toLowerCase().includes('comando:') || line.includes('```') || line.includes('`')) {
            if (currentList.length > 0) {
              htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
              currentList = [];
            }
            inCodeBlock = true;
            htmlParts.push('<pre><code>');
          }
          // Detectar fim de bloco de código
          else if (inCodeBlock && (line.includes('```') || line === '')) {
            inCodeBlock = false;
            htmlParts.push('</code></pre>');
          }
          // Processar linha em bloco de código
          else if (inCodeBlock) {
            htmlParts.push(line + '\n');
          }
          // Processar passos numerados
          else if (/^\d+[°ªº\.\-]/.test(line)) {
            const stepText = line.replace(/^\d+[°ªº\.\-]\s*/, '');
            currentList.push(stepText);
          }
          // Processar linha normal
          else if (line) {
            if (currentList.length > 0) {
              htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
              currentList = [];
            }
            htmlParts.push(`<p>${line}</p>`);
          }
        });
        
        // Adicionar última lista se houver
        if (currentList.length > 0) {
          htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
        }
        
        stepsHTML = htmlParts.join('');
      } else {
        // Texto simples sem passos numerados - converter parágrafos
        const paragraphs = steps.split('\n\n');
        stepsHTML = paragraphs.map(p => {
          const lines = p.split('\n');
          if (lines.length > 1) {
            return `<p>${lines.join('<br>')}</p>`;
          }
          return `<p>${p}</p>`;
        }).join('');
      }
    }
    
    console.log('Conteúdo HTML gerado:', stepsHTML.substring(0, 200) + '...');
    
    // Criar novo artigo APENAS COM STEPS (SEM SOLUTION)
    const newArticle = {
      id: newId,
      title: title.trim(),
      category: category,
      categoryName: categoryMap[category] || 'Outros',
      steps: stepsHTML, // Salvar HTML formatado nos steps
      tags: processedTags,
      date: new Date().toLocaleDateString('pt-BR'),
      views: 0
    };
    
    // Adicionar à base
    knowledge.articles.push(newArticle);
    
    if (!writeKnowledgeBase(knowledge)) {
      return res.status(500).json({ 
        error: 'Erro ao salvar',
        message: 'Não foi possível salvar o artigo'
      });
    }
    
    res.status(201).json(newArticle);
    
  } catch (error) {
    console.error('Erro ao adicionar artigo:', error);
    res.status(500).json({ 
      error: 'Erro ao adicionar artigo',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


// Rota para atualizar um artigo existente
app.put('/api/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, sintoma, steps, tags } = req.body;
    
    if (!title || !category || !sintoma || !steps) {
      return res.status(400).json({ 
        error: 'Dados inválidos',
        message: 'Título, categoria, sintoma e passos são obrigatórios'
      });
    }
    
    const knowledge = readKnowledgeBase();
    
    // Encontrar o artigo pelo ID
    const articleIndex = knowledge.articles.findIndex(a => a.id === parseInt(id));
    
    if (articleIndex === -1) {
      return res.status(404).json({ 
        error: 'Artigo não encontrado',
        message: `Nenhum artigo encontrado com o ID ${id}`
      });
    }
    
    // Mapear categoria para nome
    const categoryMap = {
      'it': 'TI e Infraestrutura',
      'network': 'Rede e Conexão',
      'printers': 'Impressoras',
      'software': 'Software',
      'procedures': 'Procedimentos',
      'security': 'Segurança',
      'other': 'Outros'
    };
    
    // Processar tags
    const processedTags = Array.isArray(tags) 
      ? tags 
      : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(t => t) : []);
    
    // Processar os passos (mesma lógica da criação)
    let stepsHTML = '';
    
    // Verificar se os passos já contém tags HTML
    const hasHTMLTags = /<[a-z][\s\S]*>/i.test(steps);
    
    if (hasHTMLTags) {
      
      stepsHTML = sanitizeHTML(steps);
    } else {
      // É TEXTO SIMPLES - converter para HTML básico
      const lines = steps.split('\n').map(line => line.trim()).filter(line => line);
      const hasNumberedSteps = lines.some(line => /^\d+[°ªº\.\-]/.test(line));
      
      if (hasNumberedSteps) {
        // Converter passos numerados para HTML
        let inCodeBlock = false;
        let currentList = [];
        let htmlParts = [];
        
        lines.forEach(line => {
          // Detectar início de bloco de código
          if (line.toLowerCase().includes('comando:') || line.includes('```') || line.includes('`')) {
            if (currentList.length > 0) {
              htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
              currentList = [];
            }
            inCodeBlock = true;
            htmlParts.push('<pre><code>');
          }
          // Detectar fim de bloco de código
          else if (inCodeBlock && (line.includes('```') || line === '')) {
            inCodeBlock = false;
            htmlParts.push('</code></pre>');
          }
          // Processar linha em bloco de código
          else if (inCodeBlock) {
            htmlParts.push(line + '\n');
          }
          // Processar passos numerados
          else if (/^\d+[°ªº\.\-]/.test(line)) {
            const stepText = line.replace(/^\d+[°ªº\.\-]\s*/, '');
            currentList.push(stepText);
          }
          // Processar linha normal
          else if (line) {
            if (currentList.length > 0) {
              htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
              currentList = [];
            }
            htmlParts.push(`<p>${line}</p>`);
          }
        });
        
        // Adicionar última lista se houver
        if (currentList.length > 0) {
          htmlParts.push(`<ol>${currentList.map(item => `<li>${item}</li>`).join('')}</ol>`);
        }
        
        stepsHTML = htmlParts.join('');
      } else {
        // Texto simples sem passos numerados - converter parágrafos
        const paragraphs = steps.split('\n\n');
        stepsHTML = paragraphs.map(p => {
          const lines = p.split('\n');
          if (lines.length > 1) {
            return `<p>${lines.join('<br>')}</p>`;
          }
          return `<p>${p}</p>`;
        }).join('');
      }
    }
    
    // Atualizar o artigo
    knowledge.articles[articleIndex] = {
      ...knowledge.articles[articleIndex],
      title: title.trim(),
      category: category,
      categoryName: categoryMap[category] || 'Outros',
      sintoma: sintoma.trim(),
      steps: stepsHTML,
      tags: processedTags
      // Mantém o ID, data de criação e views
    };
    
    if (!writeKnowledgeBase(knowledge)) {
      return res.status(500).json({ 
        error: 'Erro ao salvar',
        message: 'Não foi possível salvar as alterações'
      });
    }
    
    res.json(knowledge.articles[articleIndex]);
    
  } catch (error) {
    console.error('Erro ao atualizar artigo:', error);
    res.status(500).json({ 
      error: 'Erro ao atualizar artigo',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Rota para deletar um artigo
app.delete('/api/knowledge/:id', (req, res) => {
  try {
    const { id } = req.params;
    const knowledge = readKnowledgeBase();
    
    // Encontrar o artigo pelo ID
    const articleIndex = knowledge.articles.findIndex(a => a.id === parseInt(id));
    
    if (articleIndex === -1) {
      return res.status(404).json({ 
        error: 'Artigo não encontrado',
        message: `Nenhum artigo encontrado com o ID ${id}`
      });
    }
    
    // Remover o artigo
    const deletedArticle = knowledge.articles.splice(articleIndex, 1)[0];
    
    if (!writeKnowledgeBase(knowledge)) {
      return res.status(500).json({ 
        error: 'Erro ao deletar',
        message: 'Não foi possível deletar o artigo'
      });
    }
    
    res.json({ 
      success: true,
      message: 'Artigo deletado com sucesso',
      deletedArticle: deletedArticle
    });
    
  } catch (error) {
    console.error('Erro ao deletar artigo:', error);
    res.status(500).json({ 
      error: 'Erro ao deletar artigo',
      details: error.message
    });
  }
});


// Rota para atualizar visualizações
app.put('/api/knowledge/:id/view', (req, res) => {
  try {
    const { id } = req.params;
    const knowledge = readKnowledgeBase();
    const articleIndex = knowledge.articles.findIndex(a => a.id === parseInt(id));
    
    if (articleIndex === -1) {
      return res.status(404).json({ 
        error: 'Artigo não encontrado',
        message: `Nenhum artigo encontrado com o ID ${id}`
      });
    }
    
    // Incrementar visualizações
    knowledge.articles[articleIndex].views++;
    
    if (!writeKnowledgeBase(knowledge)) {
      return res.status(500).json({ 
        error: 'Erro ao atualizar',
        message: 'Não foi possível atualizar as visualizações'
      });
    }
    
    res.json({ 
      success: true,
      views: knowledge.articles[articleIndex].views 
    });
    
  } catch (error) {
    console.error('Erro ao atualizar visualizações:', error);
    res.status(500).json({ 
      error: 'Erro ao atualizar visualizações',
      details: error.message 
    });
  }
});

// Rota para obter estatísticas
app.get('/api/knowledge/stats', (req, res) => {
  try {
    const knowledge = readKnowledgeBase();
    const stats = {
      totalArticles: knowledge.articles.length,
      totalViews: knowledge.articles.reduce((sum, article) => sum + article.views, 0),
      categories: {},
      topArticles: [...knowledge.articles]
        .sort((a, b) => b.views - a.views)
        .slice(0, 5)
        .map(article => ({
          id: article.id,
          title: article.title,
          views: article.views,
          category: article.categoryName
        }))
    };
    
    // Contar por categoria
    knowledge.articles.forEach(article => {
      stats.categories[article.categoryName] = (stats.categories[article.categoryName] || 0) + 1;
    });
    
    res.json(stats);
    
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ 
      error: 'Erro ao obter estatísticas',
      details: error.message 
    });
  }
});

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

// =============== ROTAS API - OIDs ===============

app.get('/oids', (req, res) => {
  try {
    const oidsArray = JSON.parse(fs.readFileSync(oidsPath, 'utf8'));
    const oidsMap = oidsArray.reduce((acc, { nome, valores }) => {
      acc[nome] = valores;
      return acc;
    }, {});
    res.json(oidsMap);
  } catch (error) {
    console.error('Erro ao ler arquivo de OIDs:', error);
    res.status(500).json({ error: 'Erro ao carregar OIDs' });
  }
});

app.get('/oids/verify', (req, res) => {
  res.json(verifyOids);
});

app.post('/oids', (req, res) => {
  try {
    const inputOids = req.body;

    // Lê o conteúdo atual
    let oids = [];
    if (fs.existsSync(oidsPath)) {
      const oidsData = fs.readFileSync(oidsPath, 'utf8');
      oids = JSON.parse(oidsData);
    }

    const updatedOids = oids.map(oidEntry => {
      const novoValor = inputOids[oidEntry.nome]?.trim();

      return {
        nome: oidEntry.nome,
        valores: novoValor && novoValor !== ''
          ? novoValor
          : oidEntry.valores 
      };
    });

    if (updatedOids.length === 0) {
      // Cria o array a partir de verifyOids
      for (const [nome, valorPadrao] of Object.entries(verifyOids)) {
        const novoValor = inputOids[nome]?.trim();
        updatedOids.push({
          nome,
          valores: novoValor && novoValor !== '' ? novoValor : valorPadrao
        });
      }
    }

    // Salva no arquivo
    fs.writeFileSync(oidsPath, JSON.stringify(updatedOids, null, 2));
    res.json({ success: true, message: 'OIDs salvos com sucesso!' });

  } catch (error) {
    console.error('Erro ao salvar OIDs:', error);
    res.status(500).json({ error: 'Erro ao salvar OIDs' });
  }
});

// =============== ROTAS API - IMPRESSORAS ===============
app.delete('/impressoras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const printers = readPrinters();
    
    // Encontrar a impressora pelo ID
    const printerIndex = printers.findIndex(p => p.id === parseInt(id));
    
    if (printerIndex === -1) {
      return res.status(404).json({ 
        error: 'Impressora não encontrada',
        message: `Nenhuma impressora encontrada com o ID ${id}`
      });
    }

    // Remover a impressora
    printers.splice(printerIndex, 1);
    
    if (!writePrinters(printers)) {
      return res.status(500).json({ 
        error: 'Erro ao salvar dados',
        message: 'Não foi possível salvar as alterações no arquivo'
      });
    }
    
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
    const printers = readPrinters();
    const printer = printers.find(p => p.ip === ip);

    if (!printer) {
      return res.status(404).json({
        error: 'Impressora não encontrada',
        message: 'Nenhuma impressora cadastrada com este IP'
      });
    }

    const isColor = printer.colorida;
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
      printer: printer.nome,
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
    const printers = readPrinters();
    // Ordenar por nome
    printers.sort((a, b) => a.nome.localeCompare(b.nome));
    res.status(200).json(printers);
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
    const printers = readPrinters();
    
    // Verificar se já existe uma impressora com este IP
    const ipExists = printers.some(p => p.ip === ip);
    
    if (ipExists) {
      return res.status(409).json({
        error: 'Conflito',
        message: 'Já existe uma impressora com este IP'
      });
    }

    // Gerar um ID único
    const newId = printers.length > 0 ? Math.max(...printers.map(p => p.id)) + 1 : 1;
    
    // Criar nova impressora
    const newPrinter = {
      id: newId,
      nome: nome.toUpperCase(),
      ip,
      colorida: colorida || false
    };
    
    printers.push(newPrinter);
    
    if (!writePrinters(printers)) {
      return res.status(500).json({
        error: 'Erro ao salvar dados',
        message: 'Não foi possível salvar a nova impressora'
      });
    }
    
    res.status(201).json(newPrinter);
  } catch (err) {
    console.error('Erro ao cadastrar impressora:', err);
    res.status(500).json({
      error: 'Erro no servidor',
      details: err.message
    });
  }
});

// Rota para atualizar impressora
app.put('/impressoras/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, ip, colorida } = req.body;

  if (!nome || !ip) {
    return res.status(400).json({
      error: 'Dados inválidos',
      message: 'Nome e IP são obrigatórios',
      required: ['nome', 'ip']
    });
  }

  try {
    const printers = readPrinters();
    const printerIndex = printers.findIndex(p => p.id === parseInt(id));
    
    if (printerIndex === -1) {
      return res.status(404).json({
        error: 'Impressora não encontrada',
        message: `Nenhuma impressora encontrada com o ID ${id}`
      });
    }

    // Verificar se o IP já existe em outra impressora
    const ipExists = printers.some(p => p.ip === ip && p.id !== parseInt(id));
    
    if (ipExists) {
      return res.status(409).json({
        error: 'Conflito',
        message: 'Já existe outra impressora com este IP'
      });
    }

    // Atualizar a impressora
    printers[printerIndex] = {
      ...printers[printerIndex],
      nome: nome.toUpperCase(),
      ip,
      colorida: colorida || false
    };
    
    if (!writePrinters(printers)) {
      return res.status(500).json({
        error: 'Erro ao salvar dados',
        message: 'Não foi possível salvar as alterações'
      });
    }
    
    res.status(200).json(printers[printerIndex]);
  } catch (err) {
    console.error('Erro ao atualizar impressora:', err);
    res.status(500).json({
      error: 'Erro no servidor',
      details: err.message
    });
  }
});

// =============== FUNÇÕES AUXILIARES SNMP ===============
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
    // Ignorar erros na leitura de detalhes
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
      const printers = readPrinters();
      const printer = printers.find(p => p.ip === ip);
      
      if (!printer) {
        return reject(new Error('Impressora não encontrada no arquivo JSON'));
      }

      const isColor = printer.colorida;
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

// =============== LISTAGEM OIDS ===============

app.get('/api/oids/:ip', (req, res) => {
    const { ip } = req.params;

    readOids(ip, (lista) => {
     
        res.json(lista);
    });
});


function readOids(ip, callback) {
    const session = snmp.createSession(ip, "public", {
        timeout: 3000,
        retries: 1
    });

    
    const resultados = [];

   
    session.subtree("1.3.6.1.2.1.43", 20, (varbinds) => {
        for (const vb of varbinds) {
            if (!snmp.isVarbindError(vb)) {
                resultados.push({
                    oid: vb.oid.toString(),
                    value: vb.value ? String(vb.value) : "N/A"
                });
            }
        }
    }, (err) => {
      
        session.close();
        if (err) {
            console.error("Erro no SNMP:", err.message);
        }
       
        callback(resultados);
    });
}


// =============== INICIALIZAÇÃO DO SERVIDOR ===============
const requiredFiles = [
  'index.html',  
  'cadastro-impressoras.html',
  'config.html',
  'biblioteca.html'
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
  console.log(`=== SERVIDOR SEPROR INICIADO ===`);
  console.log(`Servidor rodando em: http://${config.host}:${config.port}`);
  console.log(`Dashboard: http://${config.host}:${config.port}/dashboard`);
  console.log(`Biblioteca: http://${config.host}:${config.port}/biblioteca`);
  console.log(`Cadastro de Impressoras: http://${config.host}:${config.port}/cadastro-impressoras`);
  console.log(`Configurações: http://${config.host}:${config.port}/config`);
  console.log(`OIDs: http://${config.host}:${config.port}/oid`);  
  console.log(``);
  console.log(`Arquivos de dados:`);
  console.log(`- Impressoras: ${printersPath}`);
  console.log(`- Configurações: ${configPath}`);
  console.log(`- OIDs: ${oidsPath}`);
  console.log(`- Base de Conhecimento: ${knowledgePath}`);
  console.log(`================================`);
});