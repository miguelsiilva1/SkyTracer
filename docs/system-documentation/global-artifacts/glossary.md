# Glossário

**Termos, expressões e acrónimos, por ordem alfabética (PT)**

| Termo (PT) | Termo (EN) | Descrição |
| :--- | :--- | :--- |
| ADS-B | Automatic Dependent Surveillance–Broadcast | Sistema em que a aeronave determina a sua posição (GNSS) e a difunde periodicamente em 1090 MHz, sem interrogação. |
| Aeronave | Aircraft | Avião identificado de forma única pelo seu endereço ICAO de 24 bits (`hex`). |
| Aeroporto | Airport | Infraestrutura identificada pelos códigos ICAO (4 letras, p. ex. `LPPR`) e IATA (3 letras, p. ex. `OPO`). |
| Alcance | Range | Distância entre o recetor e a aeronave mais afastada recebida numa dada direção. Base do mapa de cobertura (US17). |
| Cache negativa | Negative cache | Registo de que um recurso não existe numa API externa ("não encontrado"), para não repetir o pedido. |
| Callsign | Callsign / Flight ID | Identificador do voo transmitido pela aeronave (p. ex. `TAP1234`). Associa a aeronave a uma rota. |
| Categoria | Emitter category | Classe da aeronave transmitida em ADS-B (p. ex. `A3` = avião grande). |
| Companhia aérea | Airline | Operador do voo, identificado pelos códigos ICAO (3 letras) e IATA (2 letras). |
| dump1090 | dump1090 | Descodificador de Modo S/ADS-B. O recetor da UC publica o resultado em `aircraft.json` (variante *mutability*). |
| Endereço ICAO | ICAO 24-bit address (`hex`) | Identificador único e permanente atribuído a cada aeronave, representado em 6 dígitos hexadecimais. |
| Enriquecimento | Enrichment | Complemento dos dados recebidos com informação de fontes externas (matrícula, modelo, rota, fotografia). |
| Estado atual | Live state | Última observação conhecida de uma aeronave (tabela `aircraft_live`). |
| Leitura do recetor | Receiver snapshot | Resumo de uma leitura do `aircraft.json`: total de mensagens, de aeronaves e de aeronaves com posição. |
| Matrícula | Registration | Identificador administrativo da aeronave (p. ex. `CS-TUA`). |
| METAR | METAR | Relatório meteorológico aeronáutico de rotina de um aeroporto (vento, visibilidade, etc.). |
| MLAT | Multilateration | Posição calculada pela diferença dos tempos de chegada do sinal a vários recetores, quando a aeronave não envia posição ADS-B. |
| Modo S | Mode S | Modo de radar secundário em que cada aeronave tem endereço próprio; o ADS-B é transmitido em mensagens Modo S (*Extended Squitter*). |
| NUCp | Navigation Uncertainty Category (position) | Indicador da precisão da posição transmitida. |
| Posição | Position | Observação georreferenciada (latitude, longitude, altitude) de uma aeronave num instante. |
| Rasto | Track / Trail | Sequência temporal de posições de uma aeronave. |
| Replay | Replay | Reprodução do espaço aéreo num instante passado a partir das posições guardadas (US12). |
| Retenção | Retention | Período durante o qual os dados históricos são mantidos (30 dias por omissão). |
| Rota | Flight route | Par origem → destino associado a um callsign, obtido no adsbdb. |
| Rumo | Track | Direção do movimento em relação ao norte, em graus. |
| RSSI | Received Signal Strength Indicator | Intensidade do sinal recebido, em dBFS (valores mais próximos de 0 = sinal mais forte). |
| Squawk | Squawk | Código transponder de 4 dígitos octais atribuído pelo controlo. `7500` interferência ilícita, `7600` falha de comunicações, `7700` emergência. |
| TTL | Time To Live | Tempo de validade de um dado em cache antes de ser renovado. |
| WebSocket | WebSocket | Ligação bidirecional persistente usada para enviar o estado ao cliente sem *polling*. |
