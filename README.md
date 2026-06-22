# Mark Draw

Mark Draw est un éditeur web de diagrammes ASCII/Unicode pensé pour créer des schémas directement intégrables dans des fichiers Markdown.

Il combine une interface de dessin proche d’Excalidraw avec la précision d’une grille de caractères à la manière d’ASCIIFlow. Le rendu affiché sur le canevas est celui qui sera copié dans le presse-papiers.

![Mark Draw](src/assets/mark-draw-logo.png)

## Fonctionnalités

- Boîtes avec texte centré
- Textes libres
- Lignes, flèches et doubles flèches
- Connecteurs orthogonaux avec plusieurs points d’ancrage
- Traits continus ou pointillés
- Dessin libre avec un caractère personnalisable (`x` par défaut)
- Sélection, déplacement et redimensionnement des éléments
- Déplacement et zoom du canevas
- Grille affichable ou masquable
- Annulation et rétablissement
- Autosauvegarde locale dans le navigateur
- Sauvegarde et chargement de fichiers `.markdraw.json`
- Export sous forme de bloc de code Markdown
- Fonctionnement entièrement local, sans compte ni backend


## Démonstration

Démonstration de l'application sur [https://mark-draw.vercel.app](https://mark-draw.vercel.app)

## Utilisation

### Dessiner un connecteur

1. Sélectionnez **Ligne**, **Flèche** ou **Double flèche**.
2. Cliquez une première fois pour poser le départ.
3. Déplacez la souris pour prévisualiser le tracé orthogonal.
4. Utilisez `Ctrl`/`Cmd` + clic pour ajouter un point d’ancrage et poursuivre le tracé.
5. Cliquez sans modificateur pour terminer.
6. Appuyez sur `Échap` pour annuler le connecteur en cours.

Les points d’ancrage peuvent ensuite être déplacés avec l’outil de sélection.

### Sauvegarder un diagramme

Les boutons de dossier et de téléchargement en haut à droite permettent de charger ou sauvegarder un diagramme sur le disque. Le fichier `.markdraw.json` utilise le même format versionné que l’autosauvegarde locale.

### Exporter vers Markdown

Le bouton **Copier Markdown** recadre le diagramme, supprime les espaces inutiles en fin de ligne et copie un bloc prêt à coller :

L’option **Maximiser la compatibilité** remplace uniquement les bordures, pointillés et flèches Unicode par des caractères ASCII plus largement pris en charge (`-`, `|`, `+`, `.`, `:`, `<`, `>`, `^`, `v`). Le texte du diagramme n’est pas modifié.

````md
```
┌──────────────┐
│   Mark Draw  │
└──────┬───────┘
       ▼
```
````

### Raccourcis

| Action | Raccourci |
| --- | --- |
| Sélection | `V` ou `1` |
| Boîte | `2` |
| Texte | `3` |
| Ligne | `4` |
| Flèche | `5` |
| Double flèche | `6` |
| Dessin libre | `7` |
| Déplacer la vue | Outil main ou `Espace` + glisser |
| Annuler | `Ctrl`/`Cmd` + `Z` |
| Rétablir | `Ctrl`/`Cmd` + `Maj` + `Z` |
| Supprimer la sélection | `Suppr` ou `Retour arrière` |
| Annuler un tracé en cours | `Échap` |

## Installation

Prérequis : [Node.js](https://nodejs.org/) 20 ou supérieur.

```bash
npm install
npm run dev
```

L’application est alors accessible sur [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Scripts

```bash
npm run dev        # serveur de développement
npm run build      # vérification TypeScript et build de production
npm test           # tests unitaires
npm run test:watch # tests en mode interactif
npm run lint       # vérification TypeScript
```

## Architecture

- **React 19 + TypeScript** pour l’interface
- **Vite** pour le développement et le build
- **Canvas 2D** pour le canevas et la grille
- Un rasteriseur interne transforme les éléments en caractères Unicode
- **Vitest** couvre le routage orthogonal, les jonctions, les styles de ligne, le dessin libre, l’export et les migrations de sauvegarde

Les documents restent dans le stockage local du navigateur. Aucune donnée n’est envoyée à un serveur.

## Vérification

```bash
npm run build
npm test
```

Le projet contient actuellement 14 tests unitaires.
