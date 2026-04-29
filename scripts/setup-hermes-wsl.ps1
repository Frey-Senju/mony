# setup-hermes-wsl.ps1
# Instala Ubuntu no WSL2 e hermes-agent automaticamente.
# REQUER: PowerShell como Administrador

param(
    [string]$WslUser = "mony"
)

Write-Host "=== Mony: Setup WSL2 + Hermes Agent ===" -ForegroundColor Cyan

# Passo 1: Verificar se Ubuntu já está instalado
Write-Host "`n[1/4] Verificando distros WSL..." -ForegroundColor Yellow
$distros = wsl --list --quiet 2>$null
if ($distros -match "Ubuntu") {
    Write-Host "Ubuntu já instalado." -ForegroundColor Green
} else {
    Write-Host "[1/4] Instalando Ubuntu no WSL2..." -ForegroundColor Yellow
    Write-Host "      Aguarde o download (pode demorar alguns minutos)..." -ForegroundColor Gray
    wsl --install --distribution Ubuntu --no-launch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO na instalação do Ubuntu. Verifique conexão e tente novamente." -ForegroundColor Red
        exit 1
    }
    Write-Host "Ubuntu instalado." -ForegroundColor Green
}

# Passo 2: Inicializar Ubuntu (primeira execução cria usuário)
Write-Host "`n[2/4] Inicializando Ubuntu..." -ForegroundColor Yellow
Write-Host "      AÇÃO NECESSÁRIA: Na janela Ubuntu que abrir, crie seu usuário e senha." -ForegroundColor Cyan
Write-Host "      Quando terminar, feche a janela Ubuntu e pressione Enter aqui." -ForegroundColor Cyan
Start-Process "wsl.exe" -ArgumentList "--distribution Ubuntu" -Wait
Read-Host "Pressione Enter após fechar a janela Ubuntu"

# Passo 3: Instalar hermes no Ubuntu
Write-Host "`n[3/4] Instalando hermes-agent no Ubuntu..." -ForegroundColor Yellow
$hermesScript = @'
#!/bin/bash
set -e
echo "=== Instalando hermes-agent ==="
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.bashrc
echo "=== Hermes instalado com sucesso ==="
hermes --version 2>/dev/null || echo "hermes instalado (reinicie o terminal para usar)"
'@

$hermesScript | wsl --distribution Ubuntu -- bash
if ($LASTEXITCODE -ne 0) {
    Write-Host "AVISO: Erro durante instalação do hermes. Verifique manualmente." -ForegroundColor Yellow
} else {
    Write-Host "Hermes instalado." -ForegroundColor Green
}

# Passo 4: Configurar alias no Windows Terminal
Write-Host "`n[4/4] Configuração concluída!" -ForegroundColor Green
Write-Host ""
Write-Host "Para usar o Hermes:" -ForegroundColor Cyan
Write-Host "  wsl -d Ubuntu -- hermes          (iniciar chat)" -ForegroundColor White
Write-Host "  wsl -d Ubuntu -- hermes model    (trocar modelo LLM)" -ForegroundColor White
Write-Host "  wsl -d Ubuntu -- hermes setup    (configurar API keys)" -ForegroundColor White
Write-Host ""
Write-Host "Configurar API key (ex: Anthropic):" -ForegroundColor Cyan
Write-Host "  wsl -d Ubuntu -- hermes setup" -ForegroundColor White
