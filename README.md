# alQamarDaily — versets du Coran sur X

Compte cible : **@alQamarDaily**. Projet de publication automatique : **un fil de 10 ayat par jour à 18 h, heure Europe/Paris**, à partir du **11 novembre 2026**. Le 10 novembre, un premier tweet Al-Fatiha 1:1 a été programmé séparément pour 18 h.

## Identité visuelle validée

- Fond bleu nuit uni et légèrement dégradé, écritures ivoire.
- Arabe IndoPak et prononciation mot par mot capturés depuis Quran.com.
- Drapeaux seuls (🇬🇧, 🇫🇷, 🇹🇷), textes dans l'ordre anglais, français, turc.
- Aucun @, montagne, nuage, étoile ou trait de séparation.
- Une Lune réaliste *stylisée* au bas de l'image dont la portion illuminée suit l'éphéméride astronomique du jour à 18 h (librairie `astronomy-engine`). L'orientation est simplifiée pour l'hémisphère nord.
- Le texte français Montada est récupéré via QuranEnc séparément des notes explicatives ; les autres traductions viennent de Quran API.

## Workflow

- `Générer les aperçus` : teste le code, produit les images et conserve des copies dans `public/previews/`.
- `Vérifier Buffer (lecture seule)` : vérifie la connexion au compte sans publication.
- `Premier tweet lunaire — 10 novembre 18h` : test unique (la date et l'heure sont vérifiées dans le script ; pas de nouvelle publication automatique).
- `alQamarDaily — 10 ayat tous les jours à 18h Paris` : préparation à 17 h 20, heure de Paris, via deux créneaux UTC pour gérer le changement d'heure. Les cartes sont rendues, envoyées dans GitHub comme images publiques, puis **un seul fil de 10 posts** est programmé dans Buffer pour 18 h. L'avancement dans `state.json` n'est enregistré qu'après confirmation par Buffer.
- `Publier un tweet test (verrouillé)` : ancien workflow de test, sans déclenchement automatique.

Le compte Buffer Free autorise un nombre limité de posts ou de fils simultanément en file d'attente ; cette architecture ne garde qu'un fil quotidien à la fois.

**Sécurité et limitations :** aucun token Buffer n'est écrit dans le dépôt. Pour chaque verset, une traduction qui excède la zone lisible arrête la programmation plutôt que de couper le texte. Les très longs versets demanderont une adaptation de la mise en page en plusieurs images. La publication sur X n'est confirmée qu'après la présence du post dans l'onglet « Sent » de Buffer ou directement sur X (une programmation Buffer n'est pas une preuve de livraison).

## Commandes

```bash
npm install
npm test
npm run preview:live
```

Le jeton Buffer doit rester dans les GitHub Actions Secrets sous le nom `BUFFER_API_TOKEN`.
