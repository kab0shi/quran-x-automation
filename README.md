# Quran X Automation

Projet gratuit pour générer cinq images de versets multilingues et, après validation, les programmer chaque jour sur X via Buffer.

## État actuel

Le dépôt est volontairement en **mode aperçu uniquement** : aucun workflow quotidien n'est activé et aucune publication X ne peut partir automatiquement.

Les images contiennent :

- la référence en haut ;
- une capture fidèle de Quran.com : chaque mot arabe conserve ses signes coraniques et sa phonétique apparaît directement dessous ;
- les traductions anglaise, française et turque plus espacées ;
- un fond gris sombre uniforme, sans cartes ni encadrés colorés ; seuls les drapeaux gardent leurs couleurs ;
- une source discrète en bas à droite ;
- un texte alternatif détaillé destiné aux lecteurs d'écran.

## Tester localement

```bash
npm ci
npm test
npm run preview
```

`npm run preview:live` récupère les cinq versets depuis l'API Quran open source. Les sorties sont placées dans `public/previews/`.

## Sources de texte

Le bloc arabe et sa phonétique sont capturés directement depuis [Quran.com](https://quran.com). Les traductions et le texte alternatif viennent du projet open source [Quran API](https://github.com/fawazahmed0/quran-api) : texte arabe Uthmani pour les lecteurs d'écran, traduction anglaise de M. A. S. Abdel Haleem, traduction française de Montada Islamic Foundation et traduction turque de Diyanet İşleri.

## Sécurité

Le jeton Buffer ne doit jamais être écrit dans un fichier ni envoyé dans une conversation. Lors de l'activation finale, il sera ajouté directement dans GitHub sous `Settings → Secrets and variables → Actions` avec le nom `BUFFER_API_TOKEN`.
