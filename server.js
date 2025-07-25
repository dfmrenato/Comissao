// Importações
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const ngrok = require("@ngrok/ngrok");
const xlsx = require('xlsx');
const stream = require('stream');
require('dotenv').config();

// Definições
const app = express();
const port = process.env.BACKEND_PORTA; 

// Configuração do CORS para permitir o frontend específico
const corsOptions = {
    origin: 'https://dfmrenato.github.io', // Permite requisições apenas deste site
    methods: 'GET,POST', // Métodos permitidos
    allowedHeaders: 'Content-Type',
};

app.use(cors(corsOptions)); // Middleware principal de CORS

// Permite requisições preflight (importante para o navegador validar permissões antes da requisição real)
app.options('*', cors(corsOptions));

// Middleware para aceitar JSON
app.use(express.json());

// Conectar ao MongoDB usando o link de conexão fornecido
const uri = process.env.MONGODB_URI;

// Conectar ao MongoDB
const client = MongoClient.connect(uri);
client.then((client) => {
    db = client.db('comissao');  // Acessa o banco de dados padrão
    console.log('Conectado ao MongoDB');
}).catch((error) => {
    console.error('Erro ao conectar ao MongoDB:', error);
});
//let db = (await client).db('comissao');

// Rota de exemplo
app.get('/', (req, res) => {
    res.send('Olá, mundo! Conectado ao MongoDB!');
});

// Adicionar estoque de produto
app.post('/adicionar-estoque', async (req, res) => {
    let { nome, icone, quantidade, data_criacao, valor_da_unidade } = req.body;

    try {
        if (!nome || !data_criacao) {
            return res.status(400).json({ error_message: 'Todos os dados são obrigatórios' });
        };

        if(!quantidade) quantidade = 0;

        // Verifica se produto já existe no banco de dados
        if (await db.collection('produtos').findOne({ nome })) {
            
            db.collection('produtos').findOne({ nome }).then(produto_original => {

                let quantia_antiga = produto_original.quantidade;

                db.collection('produtos').deleteOne({ nome }).then(async () => {

                    db.collection('produtos').insertOne({ nome, icone: icone || produto_original.icone, quantidade: parseInt(quantidade)+parseInt(quantia_antiga), valor_da_unidade: valor_da_unidade || produto_original.valor_da_unidade }).then(result => {
                        console.log(`${data_criacao} Produto modificado: ${result.insertedId}`);
                    });

                    res.status(201).json({ certo: true });

                });
            })

        } else {

            if(!valor_da_unidade) return res.status(500).json({ error_message: 'Se o produto a adicionar é novo, deve-se especificar o preço.' });

            db.collection('produtos').insertOne({ nome, icone: icone || '', quantidade: parseInt(quantidade), valor_da_unidade: parseFloat(valor_da_unidade)}).then(result => {
                console.log(`${data_criacao} Produto inserido: ${result.insertedId}`);
            });
            res.status(201).json({ certo: true });

        }

    } catch (error) {
        console.error('Erro ao adicionar estoque:', error);
        res.status(500).json({ error_message: error.message });
    }
});

// Obter estoque de produto
app.post('/obter-estoque', async (req, res) => {

    try {

        // Verifica se produto já existe no banco de dados
        db.collection('produtos').find().toArray().then(produtos => {
            res.status(201).json({ produtos });
        })

    } catch (error) {
        console.error('Erro ao obter estoque:', error);
        res.status(500).json({ error_message: error.message });
    }
});

// Obter devedores pro front-end
app.post('/obter-devedores', async (req, res) => {

    try {

        // Verifica se produto já existe no banco de dados
        db.collection('devedores').find().toArray().then(devedores => {
            res.status(201).json({ devedores });
        })

    } catch (error) {
        console.error('Erro ao obter devedores:', error);
        res.status(500).json({ error_message: error.message });
    }
});

// Registrar venda de produto
app.post('/registrar-venda', async (req, res) => {
    let { nome, produto, quantidade, valor, metodo_de_pagamento, fiado, vendedor, data_venda } = req.body;

    try {
        if (!nome || !produto || !quantidade || !metodo_de_pagamento || !fiado || !vendedor || !data_venda) {
            return res.status(400).json({ error_message: 'Todos os dados são obrigatórios' });
        };

        if(fiado=="SIM") metodo_de_pagamento = "-";
        if(metodo_de_pagamento == "GRATIS") metodo_de_pagamento = "-";

        db.collection('produtos').findOne({ nome: produto }).then(produto_achado => {

            if(valor == null) valor = (parseFloat(produto_achado.valor_da_unidade) * parseInt(quantidade));

            db.collection('vendas').insertOne({ nome, produto, quantidade, valor, metodo_de_pagamento, fiado, vendedor, data_venda }).then(result => {
                console.log(`${data_venda} Venda inserida: ${result.insertedId}`);
                
                let novo_nome = produto_achado.nome;
                let nova_quantidade = parseInt(produto_achado.quantidade)-parseInt(quantidade);
                let nova_data = new Date().toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                }).replace(',', '');
                let novo_valor = produto_achado.valor_da_unidade;
    
                db.collection('produtos').deleteOne({ nome: produto }).then(() => {
                    db.collection('produtos').insertOne({ nome: novo_nome, icone: produto_achado.icone, quantidade: nova_quantidade, valor_da_unidade: novo_valor});
                    res.status(201).json({ certo: true });
                });
    
            });

            if(fiado !== "SIM") return;

            db.collection('devedores').findOne({ nome: nome }).then(devedor_achado => {

                if(devedor_achado) {
                    db.collection('devedores').deleteOne({ nome: devedor_achado.nome }).then(() => {
                        db.collection('devedores').insertOne({ nome: devedor_achado.nome, divida: devedor_achado.divida+valor, ultimo_fiado: data_venda});
                    });
                } else {
                    db.collection('devedores').insertOne({nome: nome, divida: valor, ultimo_fiado: data_venda});
                };

            });

        });

    } catch (error) {
        console.error('Erro ao registrar venda:', error);
        res.status(500).json({ error_message: error.message });
    }
});

// Pagar dívida
app.post('/pagar-divida', async (req, res) => {

    const { devedor, valor } = req.body;

    try {
        if (!devedor || !valor) {
            return res.status(400).json({ error_message: 'Todos os dados são obrigatórios' });
        }

        db.collection('devedores').findOne({nome: devedor}).then(devedor_achado => {

            if(!devedor_achado) return res.status(404).json({ error_message: 'Devedor não encontrado no banco.' });

            db.collection('devedores').deleteOne({nome: devedor_achado.nome}).then(() => {
                if(devedor_achado.divida-valor > 0) db.collection('devedores').insertOne({nome: devedor_achado.nome, divida: devedor_achado.divida-valor});
                res.status(201).json({ certo: true });
            });

        });

    } catch (error) {
        console.error('Erro ao pagar dívida:', error);
        res.status(500).json({ error_message: error.message });
    }

});

// Gerar tabela
app.get('/download', async (req, res) => {
    const dados = await db.collection('vendas').find({}).toArray();

    if(dados.length === 0) {
        return res.status(404).send('Nenhum dado encontrado.');
    };

    try {
        
        // Gera o Excel na memória
        const worksheet = xlsx.utils.json_to_sheet(dados);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Dados');

        const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Envia o arquivo como download
        res.setHeader('Content-Disposition', `attachment; filename=Planilha de vendas ${new Date().toLocaleDateString('pt-BR', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        }).replaceAll('/','.')}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        const readStream = new stream.PassThrough();
        readStream.end(excelBuffer);
        readStream.pipe(res);

    } catch (error) {
        console.error('Erro ao baixar tabela de vendas:', error);
        res.status(500).json({ error_message: error.message });
    }

});

// Gerar tabela
app.get('/devedores', async (req, res) => {
    const dados = await db.collection('devedores').find({}).toArray();

    if(dados.length === 0) {
        return res.status(404).send('Nenhum dado encontrado.');
    };

    try {
        
        // Gera o Excel na memória
        const worksheet = xlsx.utils.json_to_sheet(dados);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Dados');

        const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Envia o arquivo como download
        res.setHeader('Content-Disposition', `attachment; filename=Planilha de devedores ${new Date().toLocaleDateString('pt-BR', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        }).replaceAll('/','.')}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        const readStream = new stream.PassThrough();
        readStream.end(excelBuffer);
        readStream.pipe(res);

    } catch (error) {
        console.error('Erro ao baixar tabela de dívidas:', error);
        res.status(500).json({ error_message: error.message });
    }

});

// Ngrok
(async () => {
    // Conectar
    const listener = await ngrok.forward({
        addr: port,
        authtoken: process.env.NGROK_AUTHTOKEN,
        domain: process.env.NGROK_DOMAIN
    });
  
    // Avisar
    console.log(`Ngrok conectado`);
})();

// Iniciar o servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
process.on('uncaughtException', (error) => {
    return console.error(`Exceção não capturada: `+error);
});