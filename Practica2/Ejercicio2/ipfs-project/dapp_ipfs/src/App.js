import React, { useEffect, useState } from "react";
import "./App.css";
import { create } from "kubo-rpc-client";
import { ethers } from "ethers";
import { Buffer } from "buffer";
import logo from "./ethereumLogo.png";
import { addresses, abis } from "./contracts/src";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const TIER_NAMES = ["Bronce (Nivel 0)", "Plata (Nivel 1)", "Oro (Nivel 2)"];

function App() {
  const [account, setAccount] = useState("");
  const [storeAdmin, setStoreAdmin] = useState("");
  const [notaryAddress, setNotaryAddress] = useState("");
  const [ipfsHash, setIpfsHash] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [activeTab, setActiveTab] = useState("canje"); // "canje" | "marca" | "notario" | "ipfs"
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Estado del perfil de fidelización (getUserProfile)
  const [userProfile, setUserProfile] = useState({
    points: 0,
    tier: 0,
  });

  // Estado para Canje de Código + Ticket en IPFS (Cliente: claimReward)
  const [claimCode, setClaimCode] = useState("OFERTA2026");
  const [claimSalt, setClaimSalt] = useState("SALT123");

  // Estado para Marca Proveedora (depositEscrow y withdrawUnusedEscrow)
  const [escrowDepositEth, setEscrowDepositEth] = useState("0.01");
  const [escrowBalanceEth, setEscrowBalanceEth] = useState("0");

  // Estado para Notario Auditor (registerWinningCodes + Acta Notarial en IPFS)
  const [notaryCode, setNotaryCode] = useState("OFERTA2026");
  const [notarySalt, setNotarySalt] = useState("SALT123");
  const [notaryBrandAddr, setNotaryBrandAddr] = useState("");
  const [notaryAmountEth, setNotaryAmountEth] = useState("0.001");
  const [notaryTier, setNotaryTier] = useState(0);

  // Historial de documentos IPFS registrados
  const [historialIPFS, setHistorialIPFS] = useState([]);

  const getContract = (withSigner = false) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    if (withSigner) {
      return new ethers.Contract(
        addresses.ipfs,
        abis.ipfs,
        provider.getSigner()
      );
    }
    return new ethers.Contract(addresses.ipfs, abis.ipfs, provider);
  };

  // Convierte un texto corto (ej. "SALT123") o un hex 0x... de 32 bytes a bytes32
  const toBytes32Salt = (input) => {
    const trimmed = input.trim();
    if (trimmed.startsWith("0x") && trimmed.length === 66) {
      return trimmed;
    }
    return ethers.utils.formatBytes32String(trimmed);
  };

  const loadUserData = async (currentAccount) => {
    try {
      const addr = currentAccount || account;
      if (!addr) return;
      const contract = getContract(false);

      const currentFile = await contract.userFiles(addr);
      if (currentFile && currentFile !== ZERO_ADDRESS) {
        setIpfsHash(currentFile);
      }

      if (contract.storeAdmin) {
        setStoreAdmin(await contract.storeAdmin());
      }
      if (contract.notary) {
        setNotaryAddress(await contract.notary());
      }

      if (contract.getUserProfile) {
        const profile = await contract.getUserProfile(addr);
        setUserProfile({
          points: Number(profile.points),
          tier: Number(profile.tier),
        });
      }

      if (contract.brandEscrow) {
        const escrowWei = await contract.brandEscrow(addr);
        setEscrowBalanceEth(ethers.utils.formatEther(escrowWei));
      }

      if (contract.obtenerHistorialIPFS) {
        const items = await contract.obtenerHistorialIPFS(addr);
        setHistorialIPFS(items);
      }
    } catch (error) {
      console.warn("Aviso al leer datos del contrato:", error.message);
    }
  };

  useEffect(() => {
    async function connectWallet() {
      if (!window.ethereum) {
        setStatusMsg("MetaMask no detectado en el navegador.");
        return;
      }
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setNotaryBrandAddr(accounts[0]);
          await loadUserData(accounts[0]);
        }
      } catch (err) {
        console.error("Error conectando con MetaMask:", err);
      }
    }
    connectWallet();
  }, []);

  // Subir archivo al nodo local de IPFS Kubo (Docker)
  const uploadToIPFSNode = async (fileBuffer) => {
    const client = await create({
      url: "http://127.0.0.1:5001/api/v0",
    });
    const result = await client.add(fileBuffer);
    const cidStr = result.cid.toString();

    try {
      await client.files.cp(`/ipfs/${cidStr}`, `/${cidStr}`);
    } catch (mfsErr) {
      console.log("Archivo ya presente en MFS local:", cidStr);
    }
    return cidStr;
  };

  const retrieveFile = (e) => {
    const data = e.target.files[0];
    if (!data) return;
    setFileName(data.name);
    const reader = new window.FileReader();
    reader.readAsArrayBuffer(data);
    reader.onloadend = () => {
      setFile(Buffer(reader.result));
    };
    e.preventDefault();
  };

  // 1. Caso de Uso Cliente: Canjear Código Promocional adjuntando Ticket en IPFS (claimReward)
  const handleClaimReward = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let cidToUse = ipfsHash;
      if (file) {
        setStatusMsg("1/2 Subiendo ticket de compra a IPFS...");
        cidToUse = await uploadToIPFSNode(file);
        setIpfsHash(cidToUse);
      }
      if (!cidToUse) {
        alert("Selecciona un archivo de ticket de compra para subir a IPFS.");
        setLoading(false);
        return;
      }

      const saltBytes32 = toBytes32Salt(claimSalt);
      setStatusMsg(
        "2/2 Validando keccak256(_code, _salt) y reclamando premio ETH desde Escrow..."
      );

      const contractWithSigner = getContract(true);
      const tx = await contractWithSigner.claimReward(
        claimCode,
        saltBytes32,
        cidToUse
      );
      await tx.wait();

      setStatusMsg(
        `¡Premio canjeado con éxito! Has recibido el ETH del Escrow y +100 puntos de fidelidad. Ticket IPFS: ${cidToUse}`
      );
      await loadUserData(account);
    } catch (error) {
      console.error("Error al canjear premio:", error);
      setStatusMsg(`Error en el canje: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. Caso de Uso Marca Proveedora: Depositar y Retirar Escrow (depositEscrow / withdrawUnusedEscrow)
  const handleDepositEscrow = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("Depositando fondos ETH en la cuenta Escrow de la marca...");
    try {
      const contractWithSigner = getContract(true);
      const tx = await contractWithSigner.depositEscrow({
        value: ethers.utils.parseEther(escrowDepositEth),
      });
      await tx.wait();
      setStatusMsg(
        `¡Depósito de ${escrowDepositEth} ETH en Escrow completado correctamente!`
      );
      await loadUserData(account);
    } catch (error) {
      console.error("Error depositando Escrow:", error);
      setStatusMsg(`Error: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawEscrow = async () => {
    setLoading(true);
    setStatusMsg("Retirando fondos de Escrow no asignados a premios...");
    try {
      const contractWithSigner = getContract(true);
      const tx = await contractWithSigner.withdrawUnusedEscrow();
      await tx.wait();
      setStatusMsg("¡Fondos sobrantes de Escrow retirados correctamente!");
      await loadUserData(account);
    } catch (error) {
      console.error("Error retirando Escrow:", error);
      setStatusMsg(`Error: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. Caso de Uso Notario Auditor: Subir Acta Notarial a IPFS y registrar códigos (registerWinningCodes)
  const handleRegisterWinningCodes = async (e) => {
    e.preventDefault();
    if (!file) {
      alert(
        "Selecciona el documento PDF/TXT del Acta Notarial de las bases legales para subirlo a IPFS."
      );
      return;
    }
    setLoading(true);
    try {
      setStatusMsg("1/2 Subiendo Acta Notarial de las bases legales a IPFS...");
      const cidActa = await uploadToIPFSNode(file);

      const saltBytes32 = toBytes32Salt(notarySalt);
      const codeHash = ethers.utils.solidityKeccak256(
        ["string", "bytes32"],
        [notaryCode, saltBytes32]
      );
      const amountWei = ethers.utils.parseEther(notaryAmountEth);

      setStatusMsg(
        `2/2 Registrando Hash (${codeHash.slice(
          0,
          12
        )}...) como Notario y bloqueando saldo del Escrow de la Marca...`
      );

      const contractWithSigner = getContract(true);
      const tx = await contractWithSigner.registerWinningCodes(
        [codeHash],
        [notaryBrandAddr],
        [amountWei],
        [Number(notaryTier)],
        cidActa
      );
      await tx.wait();

      setIpfsHash(cidActa);
      setStatusMsg(
        `¡Código registrado por el Notario! Hash: ${codeHash} | CID Acta IPFS: ${cidActa}`
      );
      await loadUserData(account);
    } catch (error) {
      console.error("Error en registro notarial:", error);
      setStatusMsg(`Error: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 4. Función base Ejercicio 1: Subir fichero directamente con setFileIPFS
  const handleBasicIPFSUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Selecciona un archivo primero.");
      return;
    }
    setLoading(true);
    setStatusMsg("Subiendo archivo a IPFS y ejecutando setFileIPFS...");
    try {
      const cid = await uploadToIPFSNode(file);
      const contractWithSigner = getContract(true);
      const tx = await contractWithSigner.setFileIPFS(cid);
      await tx.wait();

      setIpfsHash(cid);
      setStatusMsg(`Archivo guardado en IPFS y Ethereum con CID: ${cid}`);
      await loadUserData(account);
    } catch (error) {
      console.error("Error:", error);
      setStatusMsg(`Error: ${error.reason || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="top-bar">
          <img src={logo} className="App-logo-small" alt="logo" />
          <div>
            <h2>PromoEscrowLoyalty + IPFS</h2>
            <p className="subtitle">
              Protocolo Descentralizado de Fidelización, Custodia en Escrow,
              Notaría y Almacenamiento IPFS
            </p>
          </div>
        </div>

        {/* Estado de Roles y Perfil del Cliente */}
        <div className="profile-banner">
          <div>
            <strong>Tu Wallet:</strong> <code>{account || "No conectada"}</code>
          </div>
          <div className="profile-metrics">
            <span className="badge">
              🏆 Categoría (Tier):{" "}
              <strong>{TIER_NAMES[userProfile.tier] || "Bronce"}</strong>
            </span>
            <span className="badge">
              ⭐ Puntos (Loyalty): <strong>{userProfile.points} pts</strong>
            </span>
            <span className="badge">
              🏦 Tu Saldo Escrow Disponible:{" "}
              <strong>{escrowBalanceEth} ETH</strong>
            </span>
          </div>
          {notaryAddress && (
            <small style={{ color: "#8b949e" }}>
              Comercio Admin: <code>{storeAdmin}</code> | Notario Auditor:{" "}
              <code>{notaryAddress}</code>
            </small>
          )}
        </div>

        {/* Pestañas por Actor del Sistema */}
        <div className="tabs">
          <button
            className={activeTab === "canje" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("canje")}
          >
            1. Cliente: Canjear Código + Ticket IPFS
          </button>
          <button
            className={activeTab === "marca" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("marca")}
          >
            2. Marca: Depositar / Retirar Escrow
          </button>
          <button
            className={activeTab === "notario" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("notario")}
          >
            3. Notario: Registrar Códigos + Acta IPFS
          </button>
          <button
            className={activeTab === "ipfs" ? "tab-btn active" : "tab-btn"}
            onClick={() => {
              setActiveTab("ipfs");
              loadUserData(account);
            }}
          >
            4. Subida Directa e Historial IPFS
          </button>
        </div>

        {/* PESTAÑA 1: CLIENTE (claimReward + Ticket IPFS) */}
        {activeTab === "canje" && (
          <div className="card">
            <h3>Caso de Uso Principal: Canjear Código y Cobrar Premio</h3>
            <p className="card-desc">
              El Cliente sube su <strong>Ticket de Compra a IPFS</strong> e
              introduce su código promocional y palabra secreta (
              <code>bytes32 _salt</code>). El contrato valida el{" "}
              <code>keccak256</code>, transfiere el premio en ETH desde el
              Escrow y suma <strong>+100 puntos</strong> de fidelidad.
            </p>
            <form className="form-vertical" onSubmit={handleClaimReward}>
              <label>
                Código Promocional (<code>string _code</code>):
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  placeholder="Ej. OFERTA2026"
                />
              </label>
              <label>
                Palabra Secreta / Salt (se convierte a <code>bytes32 _salt</code>
                ):
                <input
                  type="text"
                  value={claimSalt}
                  onChange={(e) => setClaimSalt(e.target.value)}
                  placeholder="Ej. SALT123"
                />
              </label>
              <label>
                Ticket de Compra para subir a IPFS:
                <input type="file" name="ticket" onChange={retrieveFile} />
              </label>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? "Subiendo Ticket a IPFS y ejecutando claimReward..."
                  : "Subir Ticket a IPFS y Canjear Premio (claimReward)"}
              </button>
            </form>
          </div>
        )}

        {/* PESTAÑA 2: MARCA PROVEEDORA (depositEscrow y withdrawUnusedEscrow) */}
        {activeTab === "marca" && (
          <div className="card">
            <h3>Marca Proveedora: Gestión de Fondos en Custodia (Escrow)</h3>
            <p className="card-desc">
              Las Marcas Proveedoras (ej. Coca-Cola, Nestlé) depositan fondos en{" "}
              <code>depositEscrow()</code> para respaldar sus premios y pueden
              retirar el saldo sobrante no asignado mediante{" "}
              <code>withdrawUnusedEscrow()</code>.
            </p>
            <form className="form-vertical" onSubmit={handleDepositEscrow}>
              <label>
                Importe a depositar en Escrow (ETH):
                <input
                  type="number"
                  step="0.0001"
                  value={escrowDepositEth}
                  onChange={(e) => setEscrowDepositEth(e.target.value)}
                />
              </label>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? "Depositando..."
                  : "Depositar Fondos en Escrow (depositEscrow)"}
              </button>
            </form>
            <hr style={{ borderColor: "#30363d", margin: "18px 0" }} />
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#da3633", width: "100%" }}
              onClick={handleWithdrawEscrow}
              disabled={loading}
            >
              Retirar Saldo Escrow No Asignado (withdrawUnusedEscrow)
            </button>
          </div>
        )}

        {/* PESTAÑA 3: NOTARIO AUDITOR (registerWinningCodes + Acta en IPFS) */}
        {activeTab === "notario" && (
          <div className="card">
            <h3>
              Notario Auditor (<code>onlyNotary</code>): Registrar Códigos y Acta
              en IPFS
            </h3>
            <p className="card-desc">
              El Notario sube a IPFS el <strong>Acta Notarial con las Bases Legales</strong>{" "}
              y ejecuta <code>registerWinningCodes(...)</code>. El contrato
              descuenta y bloquea automáticamente el importe del{" "}
              <code>brandEscrow</code> de la marca patrocinadora.
            </p>
            <form
              className="form-vertical"
              onSubmit={handleRegisterWinningCodes}
            >
              <label>
                Código Premiado a registrar:
                <input
                  type="text"
                  value={notaryCode}
                  onChange={(e) => setNotaryCode(e.target.value)}
                />
              </label>
              <label>
                Salt Secreto (se codifica en <code>bytes32</code>):
                <input
                  type="text"
                  value={notarySalt}
                  onChange={(e) => setNotarySalt(e.target.value)}
                />
              </label>
              <label>
                Dirección de la Marca que financia el premio (
                <code>address brand</code>):
                <input
                  type="text"
                  value={notaryBrandAddr}
                  onChange={(e) => setNotaryBrandAddr(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label>
                Importe del Premio a bloquear del Escrow (ETH):
                <input
                  type="number"
                  step="0.0001"
                  value={notaryAmountEth}
                  onChange={(e) => setNotaryAmountEth(e.target.value)}
                />
              </label>
              <label>
                Categoría (Tier) mínima requerida:
                <select
                  value={notaryTier}
                  onChange={(e) => setNotaryTier(Number(e.target.value))}
                >
                  <option value={0}>0 - Bronce</option>
                  <option value={1}>1 - Plata (≥ 200 pts)</option>
                  <option value={2}>2 - Oro (≥ 500 pts)</option>
                </select>
              </label>
              <label>
                Documento del Acta Notarial / Bases Legales (para subir a IPFS):
                <input type="file" name="acta" onChange={retrieveFile} />
              </label>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? "Subiendo Acta a IPFS y registrando en Blockchain..."
                  : "Subir Acta a IPFS y Ejecutar registerWinningCodes"}
              </button>
            </form>
          </div>
        )}

        {/* PESTAÑA 4: SUBIDA DIRECTA (EJERCICIO 1) E HISTORIAL DE DOCUMENTOS IPFS */}
        {activeTab === "ipfs" && (
          <div className="card">
            <h3>Subida Directa a IPFS (setFileIPFS) e Historial de Auditoría</h3>
            <form
              className="form-vertical"
              onSubmit={handleBasicIPFSUpload}
              style={{ marginBottom: "20px" }}
            >
              <input type="file" name="data" onChange={retrieveFile} />
              <button type="submit" className="btn-primary" disabled={loading}>
                Upload a IPFS y guardar en userFiles (setFileIPFS)
              </button>
            </form>

            <h4>Documentos subidos a IPFS por esta cuenta:</h4>
            {historialIPFS.length === 0 ? (
              <p>Aún no hay documentos registrados para esta cuenta.</p>
            ) : (
              <table className="ipfs-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>CID en IPFS</th>
                    <th>Fecha</th>
                    <th>Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {historialIPFS.map((item, idx) => (
                    <tr key={idx}>
                      <td>#{Number(item.id)}</td>
                      <td>
                        <span className="doc-tag">{item.tipo}</span>
                      </td>
                      <td>
                        <code>{item.cidIPFS}</code>
                      </td>
                      <td>
                        {new Date(
                          Number(item.fecha) * 1000
                        ).toLocaleString()}
                      </td>
                      <td>
                        <a
                          href={`http://127.0.0.1:8080/ipfs/${item.cidIPFS}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver archivo
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {statusMsg && <div className="status-box">{statusMsg}</div>}

        {ipfsHash && (
          <div className="cid-footer">
            <strong>Último Hash IPFS (CID) en userFiles:</strong>{" "}
            <code>{ipfsHash}</code> —{" "}
            <a
              href={`http://127.0.0.1:8080/ipfs/${ipfsHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir en Gateway IPFS Local (8080)
            </a>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
