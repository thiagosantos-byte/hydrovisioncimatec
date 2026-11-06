# HYDROVISION 2.3 — realismo industrial, notificações e dashboard

## Notificações no app + WhatsApp
- Central de notificações em gaveta com abas Alertas, WhatsApp e Envios.
- Entrega em tempo real no aplicativo via Server-Sent Events, com contador de não lidos no sino.
- API de WhatsApp com quatro provedores: Meta Cloud API, Twilio, Evolution API e webhook genérico.
- Webhook de entrada com comandos STATUS, SILENCIAR e ATIVAR.
- Modo demonstração com link wa.me quando não há credenciais configuradas.
- Nível mínimo de severidade, antiduplicidade por cooldown e janela de silêncio.

## Dashboard
- Sparklines reposicionadas para não invadir o texto de apoio dos indicadores.
- Cartão de canal WhatsApp com estado do provedor e resumo de alertas pendentes.
- Faixa de alerta contextual com atalhos para diagnóstico, notificação e solução virtual.
- Legendas e controles do 3D com contraste próprio no tema escuro.

## Realismo do Digital Twin
- Iluminação reformulada: luz natural por janelas envidraçadas, luminárias suspensas com pools de luz reais e preenchimento frio.
- Ambiente de estúdio mais intenso, com painéis de luz amplos que devolvem reflexos ao aço inox.
- Alvenaria industrial com relevo de chapa ondulada e estrutura metálica mais legível.
- Novos adereços de escala: tambores, pallet com caixa, armário de ferramentas, extintor, cones e demarcação de piso.
- Exposição e gamma ajustados por perfil gráfico para aço, pintura azul da bomba e concreto.

---

# HYDROVISION 2.1 — ambientação industrial e visualização do fluido

## Digital Twin e água
- Trechos de inspeção transparentes nas linhas de sucção e descarga, substituindo seções opacas da tubulação para tornar o fluido visível.
- Núcleo de água translúcido nos visores, com partículas que percorrem o trecho no sentido do fluxo e velocidade associada à vazão simulada.
- Superfície da água no visor do tanque com ondulação procedural contínua.
- Paleta do fluido, partículas e bolhas contextualizada para operação normal, entrada de ar e cavitação.

## Ambientação e câmera
- Cenário industrial aprofundado com estrutura metálica, painéis elétricos, luminárias, trilhos de serviço e tubulação elevada.
- Piso de concreto com grade de inspeção mais discreta, sem competir com os equipamentos.
- Iluminação de recorte e preenchimento mais equilibrada, com paleta de maior contraste e fundo menos lavado.
- Enquadramento geral aproximado para destacar a instalação, com adaptação específica para telas verticais.

## Desempenho
- Contagem de partículas e detalhes dos visores ajustada conforme o perfil gráfico selecionado.
- Superfície animada do tanque utiliza geometria subdividida de baixa complexidade para manter o efeito leve.
- Nenhuma dependência externa ou asset 3D adicional foi introduzido.

---

# HYDROVISION 2.0 — evolução visual e apresentação

## Digital Twin e renderização
- Iluminação de apresentação refinada, com variação de luz e sombra por perfil gráfico.
- Melhorias na carcaça da bomba e pás curvas no rotor para uma leitura mecânica mais convincente.
- Núcleo translúcido de fluido dentro das linhas de sucção e descarga, integrado ao estado da bomba e das válvulas.
- Partículas e bolhas com contagem adaptada ao perfil de renderização.
- Câmeras predefinidas: visão geral, frontal, lateral, superior e inspeção de componentes.
- Enquadramento da câmera ajustado para telas verticais e horizontais.

## Desempenho e dispositivos
- Perfil automático com base na largura da tela, memória e núcleos reportados pelo navegador.
- Perfis manuais de qualidade alta, equilibrada e econômica.
- Ajuste de pixel ratio, antialiasing, sombras, iluminação de ambiente e sombras de contato por perfil.
- Controles de órbita e zoom ajustados para toque; deslocamento livre reservado a telas maiores.

## Modo apresentação
- Roteiro navegável em sete etapas: visão geral, conjunto motobomba, reservatório/instrumentação, circulação, anormalidade simulada e recuperação.
- Cartão contextual para cada etapa e controle de avanço/retorno.
- Atalhos de teclado com as setas esquerda e direita.
- Entrada em tela cheia quando suportada pelo navegador.

## Dashboard
- Barra de controles da cena com seleção do perfil gráfico.
- Atalhos de câmera e inspeção dos principais equipamentos.
- Atualização da identificação de versão para 2.0.

## Limites técnicos
- O Digital Twin continua sendo uma representação procedural construída em Three.js, não um modelo CAD certificado nem um gêmeo físico calibrado.
- Para alcançar fidelidade de fabricação/fotorrealismo de um equipamento específico, ainda é necessário inserir modelos GLB/GLTF ou CAD licenciados e aprovados para a bomba, o motor e o tanque reais.
- A qualidade automática é uma heurística baseada nos recursos reportados pelo navegador; o perfil pode ser ajustado manualmente.
- Os valores e cenários continuam demonstrativos e não representam medições de uma instalação física.

## 2.2.0 — Identidade azul e animações refinadas

- Substituída a identidade verde por uma paleta azul/ciano nos temas escuro e claro.
- Atualizadas as cores dos gráficos, estados de seleção, indicadores e realces do Digital Twin.
- Adicionadas microinterações a botões, ícones, atalhos, controles e cartões de cenário.
- Incluído brilho deslizante nos botões de ação principais e pulso azul nos indicadores de operação.
- Válvulas agora animam suavemente a rotação do volante.
- Partículas de fluxo acompanham a tangente das tubulações e têm movimento mais evidente.
- Respeitada a preferência por movimento reduzido do sistema.
