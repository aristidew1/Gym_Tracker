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

## Installation et contrôle sur le téléphone

Dans un terminal `zsh` interactif, l’alias `apkmuscu` installe l’APK de debug
courant sur le téléphone :

```sh
apkmuscu
```

Le dossier scrcpy est `/home/aris/Downloads/scrcpy-linux-x86_64-v4.1`. Son
exécutable `./scrcpy` ouvre directement la connexion avec le téléphone. Le
binaire `./adb` du même dossier permet les captures et diagnostics Android.
