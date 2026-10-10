// SPDX-License-Identifier: Unlicenced
pragma solidity 0.8.30;

contract TokenContract {
    address public owner;

    struct Receivers {
        string name;
        uint256 tokens;
    }

    mapping (address => Receivers) public users;

    modifier onlyOwner() {
        require(msg.sender == owner, "No eres el propietario");
        _;
    }

    constructor() {
        owner = msg.sender;
        users[owner].tokens = 100; // El creador empieza con 100 tokens
    }

    function double(uint value) public pure returns (uint) {
        return value * 2;
    }

    function register(string memory _name) public {
        users[msg.sender].name = _name;
    }

    function giveToken(address _receiver, uint256 amount) public onlyOwner {
        require(users[owner].tokens >= amount, "El propietario no tiene suficientes tokens");
        users[owner].tokens -= amount;
        users[_receiver].tokens += amount;
    }

    /// @notice Permite comprar tokens con Ether (1 token = 5 Ether)
    function buyTokens(uint256 _amount) public payable {
        uint256 cost = _amount * 5 ether;

        // 1. Validar que se envíe suficiente Ether
        require(msg.value >= cost, "Ether insuficiente: 1 token cuesta 5 Ether");

        // 2. Validar que el propietario tenga suficiente stock
        require(users[owner].tokens >= _amount, "El propietario no tiene suficientes tokens");

        // 3. Transferir los tokens
        users[owner].tokens -= _amount;
        users[msg.sender].tokens += _amount;

        // 4. Devolver el cambio si envió Ether de más
        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }

    /// @notice Muestra la cantidad de Ether almacenada en el contrato inteligente
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
