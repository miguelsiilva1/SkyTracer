# Glossary

**Terms, expressions and acronyms, in alphabetical order**

| Term | Description |
| :--- | :--- |
| ADS-B (Automatic Dependent Surveillance–Broadcast) | System in which an aircraft determines its own position (GNSS) and broadcasts it periodically on 1090 MHz, without interrogation. |
| Aircraft | Aeroplane uniquely identified by its 24-bit ICAO address (`hex`). |
| Airline | Operator of a flight, identified by its ICAO (3-letter) and IATA (2-letter) codes. |
| Airport | Facility identified by its ICAO (4-letter, e.g. `LPPR`) and IATA (3-letter, e.g. `OPO`) codes. |
| Callsign (Flight ID) | Flight identifier transmitted by the aircraft (e.g. `TAP1234`). Links the aircraft to a route. |
| dump1090 | Mode S/ADS-B decoder. The course receiver publishes its output as `aircraft.json` (*mutability* variant). |
| Durable Object | Cloudflare Workers component with a single instance, its own memory and storage, and alarms; it runs the SkyTracer collection loop and API (`Tracker`). |
| Emitter category | Aircraft class transmitted in ADS-B (e.g. `A3` = large aircraft). |
| Enrichment | Supplementing received data with information from external sources (registration, model, route, photo). |
| Flight route | Origin → destination pair associated with a callsign, obtained from adsbdb. |
| ICAO 24-bit address (`hex`) | Unique, permanent identifier assigned to each aircraft, represented as 6 hexadecimal digits. |
| Live state | Most recent known observation of an aircraft, kept in the memory of the `Tracker` Durable Object. |
| METAR | Routine aeronautical weather report for an airport (wind, visibility, etc.). |
| MLAT (Multilateration) | Position computed from differences in signal arrival times at several receivers, used when the aircraft does not broadcast an ADS-B position. |
| Mode S | Secondary surveillance radar mode in which each aircraft has its own address; ADS-B is transmitted in Mode S messages (*Extended Squitter*). |
| Negative cache | Record that a resource does not exist in an external API ("not found"), so that the request is not repeated. |
| NUCp (Navigation Uncertainty Category – position) | Indicator of the accuracy of the transmitted position. |
| Position | Georeferenced observation (latitude, longitude, altitude) of an aircraft at a given instant. |
| Range | Distance between the receiver and the farthest aircraft received in a given bearing. Basis of the coverage map (US17). |
| Receiver snapshot | Summary of one `aircraft.json` read: total messages, total aircraft and aircraft with a position. |
| Registration | Administrative identifier of an aircraft (e.g. `CS-TUA`). |
| Replay | Reproduction of the airspace at a past instant from the stored positions (US12). |
| Retention | Period during which historical data is kept (7 days). |
| RSSI (Received Signal Strength Indicator) | Strength of the received signal, in dBFS (values closer to 0 indicate a stronger signal). |
| Squawk | 4-digit octal transponder code assigned by air traffic control. `7500` unlawful interference, `7600` radio failure, `7700` emergency. |
| Track | (1) Direction of movement relative to true north, in degrees. (2) Time-ordered sequence of positions of an aircraft (trail). |
| TTL (Time To Live) | Validity period of a cached item before it is refreshed. |
| WebSocket | Persistent bidirectional connection used to push state to the client without polling. |
