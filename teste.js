function calcularImpressora(x, y) {
    const capacidadeImpressora = 15000;
    const result = x - y;
    const porcentagemImpressora = (result / capacidadeImpressora) * 100;

    return `Estimativa: ${result} com porcentagem: ${porcentagemImpressora.toFixed(2)}%`;
}

//teste de valores aleatorios
console.log(calcularImpressora(6000, 5500));


// variaveis aleatorias, com possibilidade de passar como parametro ou direto dentro da função
// retorna a porcentagem fracionada
// REVER ISSO AQUi, principalmente a porcentagem e sua impressão