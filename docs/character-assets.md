# Персонажи и анимации

5 сентября 2026 года.

## Изображения

Встроенный ImageGen создал новые 3D-рендеры по исходным персонажам. Для web подготовлены прозрачные спрайты WebP 768 × 768: `public/assets/bag-3d.webp` (79 636 байт) и `public/assets/squirrel-3d.webp` (111 860 байт). Исходный генератор вернул RGB с шахматной подложкой; подложка удалена при подготовке альфа-маски. Проверены края, майка белки, прозрачность снаружи и просвет между телом и хвостом. Это растровые 3D-рендеры с анимацией позы, не интерактивные 3D-модели.

## Промпты

### bag

```text
Use case: stylized-concept.
Asset type: transparent 3D character cutout for a mobile tap game, square 1024x1024.
Input image 1 is a character identity reference; create an improved replacement of the red Bristol shopping bag mascot.
Subject: friendly expressive rounded RED shopping BAG with two shopping bag handles and subtle bag folds, large appealing eyes and joyous smile, small dimensional red arms, little feet. Premium playful 3D toy render with appealing smooth soft material and convincing dimensional modeling. A few groceries peeking out between handles are allowed as in reference. White Cyrillic brand on front, exact text «Бристоль» spelled Б р и с т о л ь, readable typography placed below the face. Preserve distinctive red shopping bag identity from reference.
Composition: one character alone, complete full silhouette centered, near-front view, full handles, hands and feet all visible, generous 8% clear padding. Character must read beautifully at only 220 pixels tall. Soft studio lighting from above-left and clean rich red with soft highlights.
Background: actual transparent alpha, empty clear pixels around silhouette. No floor, no cast ground shadow, no black halo, no background, no backplate, no checkerboard painted into pixels, no border, no extra characters or lettering.
Keep all shadow modeling confined inside the object. Deliver transparent PNG.
```

### squirrel

```text
Use case: stylized-concept.
Asset type: transparent 3D character cutout for a mobile tap game, square 1024x1024.
Input image 1 is a character identity and action reference; create an improved replacement of this charming mischievous squirrel carrying a stolen Bristol bag. Same premium playful 3D toy rendering world as a smiling red shopping bag mascot.
Subject: adorable mischievous SQUIRREL with russet orange fur, very large fluffy curled tail, expressive eyes, tufted ears, cheeky charming smile, full body, embracing a small red Bristol shopping bag in its forepaws. White tank top and blue shorts as in reference. The small red bag should have handles, tiny expressive face and white Cyrillic brand exact text «Бристоль» spelled Б р и с т о л ь. Keep wardrobe clean and logo only on bag. Rounded dimensional anatomy and groomed soft fur, polished modern family animation quality.
Composition: one squirrel holding one bag, whole silhouette centered with every ear/tail tip/foot and bag handle visible, no cropped anatomy, generous 8% transparent padding, lively sneaking pose readable at 220px tall, squirrel face and bag front visible. Soft studio illumination, rich orange and red colors.
Background: actual transparent alpha, empty clear pixels around silhouette. No floor, no cast ground shadow, no black halo, no background, no backplate, no checkerboard painted into pixels, no border, no extra lettering or objects. Keep shading inside the character silhouettes. Deliver transparent PNG.
```

## Повторная проверка

- Chrome, игровой сервер и экраны 390 × 844 и 320 × 568. Временная оболочка задерживала ответы игровых команд на 800 мс, не меняя результаты. Перед сборкой оболочка удалена.
- Девять нажатий: визуальный отклик счётчика 13,2–45,5 мс. Проверены быстрые двойные нажатия и продолжение тапов во время анимации спасения.
- Белка на 4-м тапе, бустер 50 монет, анимация побега, проигрыш на 8-м тапе. Баланс после бустера 9196; проигрыш не создал начисления.
- Финал 120/120: 2350 монет и один подарок; итоговый баланс 11546. Один перелёт монет. «Продолжить» во время эффекта: 15,7 мс; серверный запрос для продолжения не нужен.
- Персонажи загрузились, на фоне нет шахматной подложки/чёрного прямоугольника. Окна и кнопки помещаются на малом экране.
- Типы TypeScript проверены. Экономика/API не менялись. Режим уменьшенного движения предусмотрен в CSS и эффектах; физический телефон не проверялся.

- Production-сборка успешна; полный набор: 44 теста, 44 пройдены, 0 ошибок.
