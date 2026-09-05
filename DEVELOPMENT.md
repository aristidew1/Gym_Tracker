# Développement

Les fichiers à la racine (`app.js`, `data/`, `models/`, `services/`, etc.) sont la source de vérité du projet web.

`www/` est la copie distribuée à Capacitor Android, conformément à `capacitor.config.json` (`webDir: "www"`). Ne pas modifier `www/` à la main.

Après toute modification des sources, exécuter :

```sh
npm run sync:web
```

Pour synchroniser également le projet Android :

```sh
npm run sync:android
```

Pour synchroniser le projet iOS avant une compilation Xcode :

```sh
npm run sync:ios
```

Les vérifications de la logique métier se lancent avec :

```sh
npm test
```

## Compte (Better Auth)

`services/auth.js` parle au serveur de sync self-hosted (`server/`, voir son
propre README). Après avoir ajouté `@capacitor/preferences`, `@capacitor/app`
et `@capawesome/capacitor-google-sign-in`, relancer `npm install` puis
`npm run sync:android` / `sync:ios` pour que Capacitor les enregistre côté
natif. Le lien magique et Google (mobile) redirigent vers le custom URL scheme
`gymtracker://auth-callback`, déjà déclaré dans `AndroidManifest.xml` et
`Info.plist` — Google Sign-In natif nécessite en plus de créer les clients
OAuth (Google Cloud Console, pas Firebase) et de renseigner le `GIDClientID` /
schéma d'URL inversé dans `Info.plist` une fois le client iOS créé (voir le
commentaire TODO dans ce fichier).

## Installation et contrôle sur le téléphone

Dans un terminal `zsh` interactif, l’alias `apkmuscu` installe l’APK de debug
courant sur le téléphone :

```sh
apkmuscu
```

Le dossier scrcpy est `/home/aris/Downloads/scrcpy-linux-x86_64-v4.1`. Son
exécutable `./scrcpy` ouvre directement la connexion avec le téléphone. Le
binaire `./adb` du même dossier permet les captures et diagnostics Android.
