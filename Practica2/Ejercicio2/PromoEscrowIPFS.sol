// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.30;

/**
 * @title PromoEscrowLoyaltyIPFS
 * @dev Práctica 2 - Ejercicio 2: Evolución directa de PromoEscrowLoyalty (Práctica 1) e IpfsStorage (Práctica 2 - Ej. 1).
 *      Mantiene íntegramente los 4 actores, modificadores (onlyStoreAdmin, onlyNotary), bloqueo de Escrow en el
 *      registro notarial, retiro de fondos sobrantes (withdrawUnusedEscrow) y canje con bytes32 _salt,
 *      añadiendo el almacenamiento en IPFS de las Actas Notariales y los Tickets de Compra.
 */
contract PromoEscrowLoyaltyIPFS {

    // ==========================================
    //  ESTRUCTURAS DE DATOS Y ESTADOS
    // ==========================================

    struct Reward {
        uint256 amount;         // Monto del premio en Wei
        address brand;          // Marca proveedora que financia el premio
        bool isClaimed;         // Estado: true si ya fue canjeado
        uint8 tierRequired;     // Categoría mínima del cliente (0: Bronce, 1: Plata, 2: Oro)
        string cidActaIPFS;     // CID en IPFS del Acta Notarial / Bases Legales subida por el Notario
        string cidTicketIPFS;   // CID en IPFS del Ticket de Compra subido por el Cliente al canjear
    }

    struct UserProfile {
        uint32 totalPoints;     // Puntos acumulados de fidelidad
        uint8 tier;             // Categoría actual de fidelidad (0: Bronce, 1: Plata, 2: Oro)
    }

    struct DocumentoIPFS {
        uint256 id;
        string cidIPFS;
        address autor;
        string tipo;            // "ACTA_NOTARIAL" o "TICKET_COMPRA"
        uint256 fecha;
    }

    // Roles principales (idénticos a PromoEscrowLoyalty.sol)
    address public immutable storeAdmin; // Comercio/Supermercado distribuidor
    address public immutable notary;     // Notario/Auditor independiente

    // Mapeo base del Ejercicio 1 (IpfsStorage)
    mapping(address => string) public userFiles;

    // Historial de documentos IPFS por usuario para consulta desde la DApp
    uint256 public contadorDocumentos;
    mapping(address => DocumentoIPFS[]) private historialIPFS;

    // Mapeos de almacenamiento permanente (idénticos a PromoEscrowLoyalty.sol)
    mapping(bytes32 => Reward) public rewards;          // keccak256(codigo + salt) => Reward
    mapping(address => UserProfile) public users;       // Wallet cliente => Perfil de usuario
    mapping(address => uint256) public brandEscrow;     // Marca => Saldo en custodia (Escrow) no asignado

    // ==========================================
    //  EVENTOS
    // ==========================================

    event FileStoredIPFS(address indexed user, string cidIPFS, string tipo);
    event EscrowDeposited(address indexed brand, uint256 amount);
    event CodeRegistered(bytes32 indexed codeHash, address indexed brand, uint256 amount, uint8 tierRequired, string cidActaIPFS);
    event RewardClaimed(address indexed winner, bytes32 indexed codeHash, uint256 amount, uint8 newTier, string cidTicketIPFS);
    event FundsWithdrawn(address indexed brand, uint256 amount);

    // ==========================================
    //  MODIFICADORES
    // ==========================================

    modifier onlyStoreAdmin() {
        require(msg.sender == storeAdmin, "Acceso restringido: Solo Administrador");
        _;
    }

    modifier onlyNotary() {
        require(msg.sender == notary, "Acceso restringido: Solo Notario Auditor");
        _;
    }

    // ==========================================
    //  CONSTRUCTOR
    // ==========================================

    /**
     * @dev Asigna al creador como Administrador del Comercio y configura la dirección del Notario.
     * @param _notary Dirección de la wallet del Notario Auditor.
     */
    constructor(address _notary) {
        require(_notary != address(0), "Direccion del Notario invalida");
        storeAdmin = msg.sender;
        notary = _notary;
    }

    // ==========================================
    //  FUNCIÓN BASE EJERCICIO 1 (IpfsStorage)
    // ==========================================

    /**
     * @dev Guarda el hash CID de un fichero subido a IPFS por un usuario (Ejercicio 1)
     *      y lo registra en su historial de documentos.
     * @param file CID devuelto por IPFS.
     */
    function setFileIPFS(string memory file) external {
        require(bytes(file).length > 0, "El CID no puede estar vacio");
        userFiles[msg.sender] = file;

        contadorDocumentos++;
        historialIPFS[msg.sender].push(DocumentoIPFS({
            id: contadorDocumentos,
            cidIPFS: file,
            autor: msg.sender,
            tipo: "TICKET_COMPRA",
            fecha: block.timestamp
        }));

        emit FileStoredIPFS(msg.sender, file, "TICKET_COMPRA");
    }

    // ==========================================
    //  FUNCIONES DE DEPÓSITO Y REGISTRO (Fondo y Notaría + IPFS)
    // ==========================================

    /**
     * @dev Permite a las Marcas Proveedoras depositar fondos en la cuenta de custodia (Escrow).
     */
    function depositEscrow() external payable {
        require(msg.value > 0, "El deposito debe ser mayor a 0 Wei");
        brandEscrow[msg.sender] += msg.value;

        emit EscrowDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Permite al Notario auditor registrar los hashes keccak256 de los códigos premiados
     *      vinculándolos al CID de IPFS del Acta Notarial / Bases Legales firmadas.
     * @param _codeHashes Array de hashes criptográficos de los boletos.
     * @param _brands Array de marcas que financian cada premio.
     * @param _amounts Array de importes en Wei por cada premio.
     * @param _tiersRequired Array de niveles mínimos exigidos.
     * @param _cidActaIPFS CID en IPFS del documento con el Acta Notarial y Bases Legales.
     */
    function registerWinningCodes(
        bytes32[] calldata _codeHashes,
        address[] calldata _brands,
        uint256[] calldata _amounts,
        uint8[] calldata _tiersRequired,
        string calldata _cidActaIPFS
    ) external onlyNotary {
        require(bytes(_cidActaIPFS).length > 0, "Se requiere el CID IPFS del Acta Notarial");
        uint256 length = _codeHashes.length;
        require(
            length == _brands.length &&
            length == _amounts.length &&
            length == _tiersRequired.length,
            "Longitud de arrays no coincide"
        );

        // Guardamos el CID del acta notarial en el registro IPFS del notario
        userFiles[msg.sender] = _cidActaIPFS;
        contadorDocumentos++;
        historialIPFS[msg.sender].push(DocumentoIPFS({
            id: contadorDocumentos,
            cidIPFS: _cidActaIPFS,
            autor: msg.sender,
            tipo: "ACTA_NOTARIAL",
            fecha: block.timestamp
        }));

        for (uint256 i = 0; i < length; i++) {
            bytes32 codeHash = _codeHashes[i];
            address brand = _brands[i];
            uint256 amount = _amounts[i];
            uint8 tierReq = _tiersRequired[i];

            require(rewards[codeHash].amount == 0, "Codigo ya registrado");
            require(brandEscrow[brand] >= amount, "Saldo Escrow insuficiente de la marca");

            // Bloqueamos el fondo del Escrow de la marca asignándolo al premio
            brandEscrow[brand] -= amount;

            rewards[codeHash] = Reward({
                amount: amount,
                brand: brand,
                isClaimed: false,
                tierRequired: tierReq,
                cidActaIPFS: _cidActaIPFS,
                cidTicketIPFS: ""
            });

            emit CodeRegistered(codeHash, brand, amount, tierReq, _cidActaIPFS);
        }
    }

    // ==========================================
    //  CASO DE USO PRINCIPAL: CANJEAR CÓDIGO CON TICKET EN IPFS
    // ==========================================

    /**
     * @dev Permite a un Cliente introducir un código promocional, validar el Hash keccak256,
     *      asociar el CID en IPFS de su ticket de compra, recibir el premio desde el Escrow
     *      y actualizar sus puntos/tier.
     * @param _code Código promocional en texto plano.
     * @param _salt Frase/palabra secreta en formato bytes32 asociada al código.
     * @param _cidTicketIPFS CID en IPFS del ticket/factura de compra del cliente.
     */
    function claimReward(
        string calldata _code,
        bytes32 _salt,
        string calldata _cidTicketIPFS
    ) external {
        require(bytes(_cidTicketIPFS).length > 0, "Debes adjuntar el CID IPFS del ticket de compra");

        // 1. Reconstrucción del Hash criptográfico (exactamente con string _code y bytes32 _salt)
        bytes32 codeHash = keccak256(abi.encodePacked(_code, _salt));
        Reward storage reward = rewards[codeHash];

        // 2. Validaciones (Checks)
        require(reward.amount > 0, "El codigo no existe o no esta premiado");
        require(!reward.isClaimed, "El codigo ya ha sido canjeado");

        UserProfile storage user = users[msg.sender];
        require(user.tier >= reward.tierRequired, "Nivel (Tier) de usuario insuficiente");

        // 3. Modificaciones de Estado (Effects) - Patrón Anti-Reentrancia
        reward.isClaimed = true;
        reward.cidTicketIPFS = _cidTicketIPFS;

        // Registrar el CID del ticket en el almacenamiento IPFS del usuario
        userFiles[msg.sender] = _cidTicketIPFS;
        contadorDocumentos++;
        historialIPFS[msg.sender].push(DocumentoIPFS({
            id: contadorDocumentos,
            cidIPFS: _cidTicketIPFS,
            autor: msg.sender,
            tipo: "TICKET_PREMIADO",
            fecha: block.timestamp
        }));

        // Sumar puntos de fidelidad (100 puntos por canje)
        user.totalPoints += 100;

        // Promoción de Tier basada en puntos acumulados
        if (user.totalPoints >= 500 && user.tier < 2) {
            user.tier = 2; // Sube a nivel ORO
        } else if (user.totalPoints >= 200 && user.tier < 1) {
            user.tier = 1; // Sube a nivel PLATA
        }

        uint256 claimAmount = reward.amount;

        emit RewardClaimed(msg.sender, codeHash, claimAmount, user.tier, _cidTicketIPFS);

        // 4. Interacción Externa / Pago (Interactions)
        (bool success, ) = payable(msg.sender).call{value: claimAmount}("");
        require(success, "Fallo al transferir el premio en ETH");
    }

    // ==========================================
    //  FUNCIONES DE CONSULTA Y RETIRO
    // ==========================================

    /**
     * @dev Permite a las Marcas retirar sus fondos de Escrow no asignados a premios.
     */
    function withdrawUnusedEscrow() external {
        uint256 amount = brandEscrow[msg.sender];
        require(amount > 0, "No hay saldo disponible en Escrow");

        brandEscrow[msg.sender] = 0;
        emit FundsWithdrawn(msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Fallo en la transferencia de reembolso");
    }

    /**
     * @dev Consulta la información del perfil del cliente (Solo lectura, no gasta gas).
     */
    function getUserProfile(address _user) external view returns (uint32 points, uint8 tier) {
        UserProfile memory u = users[_user];
        return (u.totalPoints, u.tier);
    }

    /**
     * @dev Devuelve el historial de documentos subidos a IPFS por un usuario.
     */
    function obtenerHistorialIPFS(address _user) external view returns (DocumentoIPFS[] memory) {
        return historialIPFS[_user];
    }

    /**
     * @dev Función auxiliar pure para calcular el hash keccak256(_code, _salt) tal como lo valida el contrato.
     */
    function getPromoCodeHash(string calldata _code, bytes32 _salt) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_code, _salt));
    }
}
