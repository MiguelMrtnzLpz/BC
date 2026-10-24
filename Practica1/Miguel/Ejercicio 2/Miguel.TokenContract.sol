// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

contract TokenContract {
    address public owner;

    struct Receivers {
        string name;
        uint256 tokens;
    }

    mapping(address => Receivers) public users;

    // Precio por token: 5 Ether
    uint256 public constant TOKEN_PRICE = 5 ether;

    modifier onlyOwner() {
        require(msg.sender == owner, "Solo el owner puede ejecutar esto");
        _;
    }

    constructor() {
        owner = msg.sender;
        users[owner].tokens = 100;
    }

    function double(uint256 _value) public pure returns (uint256) {
        return _value * 2;
    }

    function register(string memory _name) public {
        users[msg.sender].name = _name;
    }

    function giveToken(address _receiver, uint256 _amount) public onlyOwner {
        require(
            users[owner].tokens >= _amount,
            "El owner no tiene suficientes tokens"
        );
        users[owner].tokens -= _amount;
        users[_receiver].tokens += _amount;
    }

    /// @notice Permite comprar tokens pagando 5 Ether por cada uno
    /// @param _amount Cantidad de tokens que se desean comprar
    function buyTokens(uint256 _amount) public payable {
        require(_amount > 0, "Debes comprar al menos 1 token");

        uint256 totalCost = _amount * TOKEN_PRICE;

        // Comprobación de Ether suficiente
        require(
            msg.value >= totalCost,
            "Ether insuficiente: 1 token cuesta 5 Ether"
        );

        // Comprobación de stock de tokens en el owner
        require(
            users[owner].tokens >= _amount,
            "El propietario no tiene suficientes tokens disponibles"
        );

        users[owner].tokens -= _amount;
        users[msg.sender].tokens += _amount;

        // Reembolso del excedente si el usuario envio mas Ether del necesario
        if (msg.value > totalCost) {
            uint256 refundAmount = msg.value - totalCost;
            (bool success, ) = payable(msg.sender).call{value: refundAmount}(
                ""
            );
            require(success, "Fallo al devolver el Ether sobrante");
        }
    }

    /// @notice Muestra la cantidad de Ether almacenada en el contrato inteligente
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
