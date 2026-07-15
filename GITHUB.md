# Cómo subir el Atlas a GitHub

Esta carpeta (`Mapas_HTML_2025`) es un sitio **estático** (HTML/CSS/JS/JSON).  
GitHub Pages puede publicarlo gratis en una URL tipo:

`https://TU_USUARIO.github.io/NOMBRE_REPO/`

---

## Opción A — Tú lo subes (recomendado, 10–15 min)

### 1. Cuenta y herramientas

1. Crea cuenta en https://github.com (si no tienes).
2. Instala **Git**: https://git-scm.com/download/win  
3. (Opcional) Instala **GitHub CLI** `gh`: https://cli.github.com/

### 2. Crear el repositorio en la web

1. Entra en https://github.com/new  
2. **Repository name:** por ejemplo `atlas-paises-2025`  
3. Público (Public) si quieres GitHub Pages gratis sin líos  
4. **No** marques “Add README” si vas a subir esta carpeta ya hecha  
5. Create repository  

### 3. Subir esta carpeta (PowerShell)

Abre PowerShell y pega (cambia `TU_USUARIO` y el nombre del repo):

```powershell
cd "C:\Users\pc\OneDrive\Documentos\Paises\Mapas_HTML_2025"

git init
git add .
git commit -m "Atlas mapas HTML v6.1 — lazy GeoJSON, combinar, quiz, comparar"

git branch -M main
git remote add origin https://github.com/TU_USUARIO/atlas-paises-2025.git
git push -u origin main
```

Git te pedirá iniciar sesión (navegador o token).

**Token (si pide password):**  
GitHub → Settings → Developer settings → Personal access tokens →  
Generate (scope `repo`) → pegar como contraseña.

### 4. Activar GitHub Pages

1. Repo → **Settings** → **Pages**  
2. Source: **Deploy from a branch**  
3. Branch: `main` → folder: `/ (root)` → Save  
4. Espera 1–2 minutos  
5. URL: `https://TU_USUARIO.github.io/atlas-paises-2025/`

Abre:

- `/index.html` — índice  
- `/combinar.html` — multi-país  
- `/atlas.html?pais=Spain` — un país  
- `/comparar.html?a=France&b=Germany` — duelo lateral  
- `/quiz.html` — cuestionario  

### 5. Actualizar después de cambios

```powershell
cd "C:\Users\pc\OneDrive\Documentos\Paises\Mapas_HTML_2025"
git add .
git commit -m "Actualizo atlas"
git push
```

---

## Opción B — Yo (Grok) lo subo por ti

**Sí puedo hacerlo**, si me das acceso de forma segura. Opciones:

### B1) GitHub CLI ya logueado en tu PC (más fácil)

Si en tu máquina ejecutas una vez:

```powershell
gh auth login
```

(elige GitHub.com → HTTPS → Login with browser)

Después me dices: *“crea el repo y sube el atlas”* y, con terminal en tu PC, puedo:

```text
gh repo create atlas-paises-2025 --public --source=. --remote=origin --push
```

desde la carpeta del atlas (o con la ruta completa).

### B2) Personal Access Token (PAT)

1. GitHub → Settings → Developer settings → **Personal access tokens**  
   - Fine-grained o classic  
2. Classic: marca scope **`repo`** (y `workflow` solo si hiciera falta)  
3. Copia el token **una vez** (empieza por `ghp_…`)  
4. **Pégalo en el chat** o, mejor, en un archivo local que yo lea y luego borremos, por ejemplo:

   `C:\Users\pc\OneDrive\Documentos\Scripts\gh_token.txt`

5. Dime el **nombre de usuario** de GitHub y el **nombre del repo** deseado.

Yo usaré el token solo para `git push` / `gh` y te diré que **revokes** el token después:

GitHub → Settings → tokens → Delete.

> ⚠️ No compartas el token en capturas públicas ni lo dejes en el repo.  
> No hace falta dar contraseña de la cuenta GitHub.

### B3) Invitarme como colaborador (no aplica a “Grok”)

Yo no soy un usuario humano de GitHub permanente.  
Lo práctico es **token o `gh auth login` en tu PC**, no “invitar a Grok como colaborador”.

---

## Qué subir (y qué no)

La carpeta entera en disco puede ser **~110 MB**. El `.gitignore` **excluye** fuentes crudas pesadas (`combo_data.js`, `countries.geojson`, etc.) para que el push quede más ligero.

| Incluir (runtime v6) | Ignorado por defecto |
|----------------------|----------------------|
| HTML de páginas | `assets/combo_data.js` (legacy) |
| `assets/*.js` v6, css | `countries.geojson`, admin1_10m… |
| `assets/borders/`, `assets/admin1/` | CSV/raw de World Bank |
| `assets/borders_lite/` (más ligero) | |
| `data/` | |
| `serve-atlas.bat`, `README.md`, `GITHUB.md` | |

Si `git push` se queja por tamaño, puedes apuntar el combinador a `borders_lite` y no subir `borders/` completo (cambia las rutas en el build).

---

## Comprobar tamaño antes de push

```powershell
cd "C:\Users\pc\OneDrive\Documentos\Paises\Mapas_HTML_2025"
Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum |
  Select-Object @{N='MB';E={[math]::Round($_.Sum/1MB,1)}}
```

---

## Después de publicar

1. Abre la URL de Pages  
2. Prueba combinar 2 países (lazy load)  
3. Prueba tema oscuro y favoritos  
4. Si algo falla: F12 → consola (CORS no aplica en Pages; sí en `file://`)

---

## Resumen

| Pregunta | Respuesta |
|----------|-----------|
| ¿Puedo subirlo yo solo? | Sí — Opción A |
| ¿Puede hacerlo Grok? | Sí — con `gh auth login` o un **PAT** (Opción B) |
| ¿Cómo te doy acceso? | Token `repo` o sesión `gh` en tu PC (no contraseña) |
| ¿Hace falta Roblox? | No. Esto es solo web estática. |
