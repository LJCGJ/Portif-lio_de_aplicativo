# Lançando o Limpador de Arquivos

O **Limpador de Arquivos** é um utilitário de limpeza para Windows que escrevi em C++/CLI com WinForms. A ideia é achar o que ocupa espaço sem você precisar caçar pasta por pasta.

## O que ele faz

São três módulos de varredura:

- **Mídia antiga** — fotos e vídeos que não são tocados há tempos
- **Instaladores abandonados** — aqueles `.exe` e `.msi` esquecidos na pasta de downloads
- **Pastas órfãs** — restos de programas já desinstalados, encontrados pelo registro

Achou? Você decide o que fazer. Dá para:

- filtrar por tamanho (KB ou MB) e marcar tudo de uma vez
- abrir o local do arquivo antes de mexer
- mandar para a **lixeira** (nada é apagado direto)
- exportar a lista em **CSV**

## Alguns detalhes que curti resolver

A varredura roda num `BackgroundWorker`, com barra de progresso de **porcentagem real** e um botão de **Cancelar** que responde na hora — a interface nunca trava. Tem também tema claro/escuro e o ícone da janela carregado de um `logo.png` em tempo de execução.

O instalador foi feito com **Inno Setup**, empacotando o runtime do Visual C++ junto e com opção de criar atalhos.

## Baixar

O instalador fica na página de *releases* do repositório. Por enquanto distribuo sem assinatura de código, então o Windows mostra o aviso de "editor desconhecido" — é só seguir em **Mais informações → Executar assim mesmo**.

> Próximo passo: caprichar no README e publicar o release com o instalador anexado.
