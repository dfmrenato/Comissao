// Vendedor identificado?
if(!sessionStorage.getItem('vendedor')) {
    location.href = 'identificar';
};

// Escrever fiados pro usuário
(async () => {
    try {
        
        // Escrever fiados

        // Comunicação com o backend
        let response = await fetch('https://evolved-legible-spider.ngrok-free.app/obter-devedores', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ })
        });

        let data = await response.json();
        
        if(data.error_message) return alert(`Erro de comunicação\n${data.error_message}`);

        if (!response.ok) {
            throw new Error('Falha na solicitação');
        }

        (() => {

            document.getElementById('NomeDevedorPagando').innerHTML = '';
            let devedores_string = [];
        
            data.devedores.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(devedor => {
                devedores_string.push(`${devedor.nome}: R$${devedor.divida}`);

                document.getElementById('NomeDevedorPagando').innerHTML += `
                    <option value="${devedor.nome}">${devedor.nome}</option>
                `;
            });

            devedores_string = devedores_string.join('<br>');

            document.getElementById("CampoDevedoresDb").innerHTML = devedores_string;

        })();
        
    } catch (error) {
        console.error(error);
        if(`${error}`.includes(`TypeError: Failed to fetch`) || `${error}`.includes(`TypeError: Load failed`)) {
            location.href = 'desligado';
        } else {
            alert(`Erro ao tentar comunicação\n${error}`);
        };
    }
})();

// Reduzir dívida no banco de dados
document.getElementById('FormularioPagarDivida').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const devedor = document.getElementById('FormularioPagarDivida').elements["devedor"].value.toUpperCase();
    const valor = parseFloat(document.getElementById('FormularioPagarDivida').elements["valor"].value.replaceAll(",","."));

    try {
        // Comunicação com o backend
        const response = await fetch('https://evolved-legible-spider.ngrok-free.app/pagar-divida', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ devedor, valor })
        });

        const data = await response.json();
        
        if(data.error_message) return alert(`Erro de comunicação\n${data.error_message}`);

        if (!response.ok) {
            throw new Error('Falha na solicitação');
        }

        location.reload();
        
    } catch (error) {
        console.error(error);
        alert(`Erro ao tentar comunicação\n${error}`);
    }
});