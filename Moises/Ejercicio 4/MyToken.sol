// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor(address initialOwner) 
        ERC20("MiPrimerToken", "MPT") 
        Ownable(initialOwner) 
    {
        // Mintea 1,000,000 de tokens al creador del contrato (con 18 decimales)
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // Función para emitir más tokens (solo ejecutable por el propietario)
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
