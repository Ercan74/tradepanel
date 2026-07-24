-- AŞAMA 1b-iii — Sonuç atfı BACKFILL (2026-07-24, iki kademeli TEXT_DERIVED)
--
-- Güncel liste (66 aday, hepsi setup_type IS NULL). Deploy sonrası
-- structured açılışlara DOKUNULMAZ (idempotent: yalnız NULL).
--
-- attribution_source kademeleri:
--   TEXT_DERIVED_EXACT  : 34  (reason'da tam token: MEAN_REVERSION / MOMENTUM_CONTINUATION)
--   TEXT_DERIVED_PHRASE : 9  (Türkçe/İng. kalıp: "momentum devam", "momentum continuation",
--                          "mean reversion", "aşırılıktan dönüş" — DAR whitelist, betimleme değil)
--   UNKNOWN             : 10  (agent açtı ama net kurulum kalıbı yok — UYDURMA yok)
--   EXTERNAL_SIGNAL     : 13  (TradingView webhook)
--   ai_decision_id      : 53  (raw_payload.decisionId, deterministik)
--   regime + entry_indicators: BACKFILL YOK (null)
--
-- setup_type + attribution_source, SQL'e REGEX değil id→değer LİSTESİ olarak
-- gömülü (deterministik). EXACT/PHRASE ayrımı: ileride "MOMENTUM kötü" gibi bir
-- sonuç phrase-derived kayıtlara mı bağlı diye FİLTRELENEBİLSİN diye.

begin;

create table if not exists positions_attribution_backup_20260724 as
select id, symbol, setup_type as old_setup_type, attribution_source as old_attribution_source,
       ai_decision_id as old_ai_decision_id, now() as backed_up_at
from positions
where id in (

  '719c0e93-24cd-4295-8f5b-ab1d1785230d',
  '8dc18bc9-c8c6-41d7-b7cb-848d0ea8dd9c',
  'ae9a587a-165a-415e-9e65-04a32ab9bc3d',
  '46810c56-da29-43ac-b24f-4cdd11958c1b',
  'a3f454df-7e08-4c66-867b-eaa48d2eaf69',
  '873017e9-6858-4648-b472-bf7e238ce389',
  '0d50922d-d342-40e2-b517-222f137fe5f4',
  '5fc4f31e-6562-4a20-93ff-cb50ff911e0e',
  'dcf2a004-dcfe-4f07-b141-1dd39cd2b525',
  '621ca989-52d3-4c47-8fad-69555d7f6bc8',
  'b29e4401-71c2-4137-a0c3-9c0c9b0d547b',
  '68dce053-f4de-412d-b1bc-ea548fb0d860',
  'f8f5493d-4a35-40be-8b51-43c5e8210a4b',
  'ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498',
  'ca35c061-89b9-440c-812a-29ce2c8f6819',
  '698975c4-a8a8-466b-a8a7-683065d769b4',
  '75374394-054d-4347-a957-219159a0c639',
  '8a8a8a84-853a-451a-a9ac-d4594e4836d8',
  '4e487e1e-03d3-46d1-9425-49b6951bc7d8',
  'e4408b29-2f5f-4081-807f-5919c61b6679',
  '1d402758-318a-4672-843d-95fcb00ea2cc',
  '9648f5a2-03c2-43c4-b8cf-7e9c7a1cefc3',
  'a39c2da7-bbb8-489d-b05e-0313cfb99e19',
  'b43b24e5-03ae-4245-9342-f9cb94c37a86',
  'cacade7c-7fe3-4766-97f4-e6b511fdf499',
  'd7acfc5f-4b64-4ea0-94d9-d9d316e370b1',
  '9acc93b9-4e66-4b86-aeb9-f49ec7c28ec5',
  '4b5feeae-b06f-4aa1-a109-9e21444d825d',
  'd5d252b0-5fdf-43af-a266-aaff92cde173',
  'ed468eaf-cfb7-4f22-89fb-4856e5e3afbf',
  '3f85ecb7-a398-4354-adc1-27991178cbd0',
  '453e3b39-00bc-4132-80de-5b6b7e57bf11',
  '79e22b1e-37bf-4906-ab98-40e4b18cd437',
  '3000b916-6e93-4991-95c6-bb9e51fb1a37',
  '2dcfcc95-a809-4481-b904-5d9693229bce',
  '2ebb98a9-136b-4ee9-b7f9-5d7c5f361164',
  'a1fc6708-c386-4c11-9c54-7112c2c7c5e4',
  '29d74824-8733-45b7-9847-15c67c32774a',
  'ffdd679f-7781-4173-bd17-d5e3c3b7d8a4',
  'c8b272fe-80a3-4c6a-8ca2-72ca5ad60c65',
  '6441535c-4c3d-4a30-ae02-f9111b2a3ba2',
  'a248def3-10f1-4285-89de-e4cf877c8a2c',
  'de4b0171-af2d-4976-bc95-a869cfcab359',
  'eb2ba4b6-a58f-4383-83a0-b5980235fc36',
  'd2a68e5b-7018-4368-b325-72388b66a81f',
  '101bf62c-7157-4922-ab13-6bd453745bda',
  '4d76702c-3a8d-479e-9664-c6c6357929a0',
  'a30b4ae0-a19e-4f00-b528-c4ccead5b6d6',
  'da1a3f72-916c-4a14-af90-a73115e0c6dd',
  '8f4b4489-ef6f-4d85-be6f-949e5b3f9fe3',
  '1564208f-54a0-4481-b1c3-457fd44c617b',
  '3bd990b1-9138-4075-8bcf-e4f4c5213682',
  '0cb8c24b-1cb1-442f-bfec-3c413b04518b',
  'e4e9aa21-89cb-4d4f-998f-145e6863b377',
  'f6a7d556-2151-4878-8567-f8be0164e16b',
  '933eb79f-b4bb-47bf-b477-c75b6349e7e1',
  '1b3cb501-27fc-4f84-9cf8-c12998fcb047',
  '3d5b3a98-70c3-487d-bc7d-5d6441064e0f',
  '02b3c917-ce3c-4b13-b885-f4dc6787ea59',
  'a4616fa5-01b1-486a-9502-1453420c1713',
  'f9041e56-a52d-40ca-9b83-70b507a7e00f',
  '4c6f4461-44a5-4170-9ad6-4c93e55dffa3',
  '0bda0e15-23a6-401e-a8ff-bc55790e83aa',
  '1ba4c490-5ca3-444d-800b-c06c0c1186c9',
  'ebd24728-9691-45b1-a53f-9fa6c5424d1b',
  'eb6a98be-ba89-4cad-be86-431275107ad8'
);

update positions p
set ai_decision_id = v.did::uuid
from (values
  ('ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498','67c8007b-0b93-4414-95eb-585a510ad434'),
  ('ca35c061-89b9-440c-812a-29ce2c8f6819','c026a35c-6b34-4a1f-866c-f9e904033ba2'),
  ('698975c4-a8a8-466b-a8a7-683065d769b4','bc5cdc5b-f8f8-4305-96f1-c7de0441f781'),
  ('75374394-054d-4347-a957-219159a0c639','9a59b6ef-c1a4-4df0-8397-4fc104a71433'),
  ('8a8a8a84-853a-451a-a9ac-d4594e4836d8','98e48c12-000c-482c-98aa-9252bb78acb7'),
  ('4e487e1e-03d3-46d1-9425-49b6951bc7d8','12a788fb-76b7-4965-b9a0-790a9a116390'),
  ('e4408b29-2f5f-4081-807f-5919c61b6679','8e159041-db68-423d-94e9-da53a016f2ff'),
  ('1d402758-318a-4672-843d-95fcb00ea2cc','594d0ab0-5388-446d-b79f-1ff311646087'),
  ('9648f5a2-03c2-43c4-b8cf-7e9c7a1cefc3','ec3d8ebb-2a59-496c-9331-b675227c1bdf'),
  ('a39c2da7-bbb8-489d-b05e-0313cfb99e19','4295885f-001b-49bf-946b-23e2d6dbdd3f'),
  ('b43b24e5-03ae-4245-9342-f9cb94c37a86','453a9d60-e72d-48f6-b19b-ef763d057a41'),
  ('cacade7c-7fe3-4766-97f4-e6b511fdf499','1d7200ad-ad40-4133-87ff-d167454bd81f'),
  ('d7acfc5f-4b64-4ea0-94d9-d9d316e370b1','eceeda12-2281-46a4-875b-fdcc9cd7ee3b'),
  ('9acc93b9-4e66-4b86-aeb9-f49ec7c28ec5','80d3f44c-1a57-428e-9ffe-5ed670b516a5'),
  ('4b5feeae-b06f-4aa1-a109-9e21444d825d','943c548f-8f7c-4432-a9ba-b21637b10631'),
  ('d5d252b0-5fdf-43af-a266-aaff92cde173','41b2b6f8-d85b-4933-add7-c9f47192b077'),
  ('ed468eaf-cfb7-4f22-89fb-4856e5e3afbf','0b5879c1-3656-4eca-9429-71de29b20a37'),
  ('3f85ecb7-a398-4354-adc1-27991178cbd0','da372284-5abd-40d2-9d28-cc4e29b457dc'),
  ('453e3b39-00bc-4132-80de-5b6b7e57bf11','46325486-ee69-47ac-877a-eeaefdecb2d3'),
  ('79e22b1e-37bf-4906-ab98-40e4b18cd437','f1b05ba3-f3d5-42a4-8c64-fc3496ac24c2'),
  ('3000b916-6e93-4991-95c6-bb9e51fb1a37','9a8251b6-a0be-473d-8138-8f333c867635'),
  ('2dcfcc95-a809-4481-b904-5d9693229bce','dd6d6db5-5738-4076-bd55-7a57eb5bcd6a'),
  ('2ebb98a9-136b-4ee9-b7f9-5d7c5f361164','9561f334-90b5-49de-98c9-1318835e3dea'),
  ('a1fc6708-c386-4c11-9c54-7112c2c7c5e4','a0e8a7c8-ebc0-439a-8e71-00e89f564e7a'),
  ('29d74824-8733-45b7-9847-15c67c32774a','8159e505-a8d6-42bc-b99f-320197790ee3'),
  ('ffdd679f-7781-4173-bd17-d5e3c3b7d8a4','9aa96ccc-7f67-4953-be82-3fc66cd378a2'),
  ('c8b272fe-80a3-4c6a-8ca2-72ca5ad60c65','dd9981ea-26e1-4f0e-a57d-2e38ee21b92c'),
  ('6441535c-4c3d-4a30-ae02-f9111b2a3ba2','c63bfff3-94dd-4138-a546-0abce60c5a81'),
  ('a248def3-10f1-4285-89de-e4cf877c8a2c','ba4554fa-1b1e-47ae-96f5-8e6625680edc'),
  ('de4b0171-af2d-4976-bc95-a869cfcab359','ad2a24ef-2f63-49b9-bb21-11747bee9d7e'),
  ('eb2ba4b6-a58f-4383-83a0-b5980235fc36','4ce5557f-3d4f-45df-94d6-6f646760eec7'),
  ('d2a68e5b-7018-4368-b325-72388b66a81f','4e9aa6d8-be61-48d7-b90e-63430855f6ac'),
  ('101bf62c-7157-4922-ab13-6bd453745bda','e5e209dc-051d-429f-b471-d494a26a2d55'),
  ('4d76702c-3a8d-479e-9664-c6c6357929a0','d85b940d-6683-4842-b778-11dea93b8b63'),
  ('a30b4ae0-a19e-4f00-b528-c4ccead5b6d6','25568b35-8326-4e52-9c08-fbbb10088b5b'),
  ('da1a3f72-916c-4a14-af90-a73115e0c6dd','cf3b9351-faf3-4039-9091-d28138c8d550'),
  ('8f4b4489-ef6f-4d85-be6f-949e5b3f9fe3','48a5ab5a-149a-49b9-a84f-d30b369f44ea'),
  ('1564208f-54a0-4481-b1c3-457fd44c617b','7a36a7d0-0ea2-4ad6-949e-faf962bcba4e'),
  ('3bd990b1-9138-4075-8bcf-e4f4c5213682','ae2f7d97-0d11-4ec9-8f62-8f63b22d945a'),
  ('0cb8c24b-1cb1-442f-bfec-3c413b04518b','df81d7ac-7ae9-4f47-a8be-369dd54d7bb0'),
  ('e4e9aa21-89cb-4d4f-998f-145e6863b377','82596c2b-d8a8-4189-9a7a-29672e47cff2'),
  ('f6a7d556-2151-4878-8567-f8be0164e16b','4d9f6c7c-ad50-42ad-98c5-3b9d4a70ca2d'),
  ('933eb79f-b4bb-47bf-b477-c75b6349e7e1','153eed8a-5190-426c-9766-8869ddfa444c'),
  ('1b3cb501-27fc-4f84-9cf8-c12998fcb047','2bdf7ec4-195c-444c-ad2b-18e824091475'),
  ('3d5b3a98-70c3-487d-bc7d-5d6441064e0f','6b35a62c-8a01-4cc2-a81c-d8d5949e8b4b'),
  ('02b3c917-ce3c-4b13-b885-f4dc6787ea59','1ff94767-0d0f-44f4-9cfa-f6d7a5d80d68'),
  ('a4616fa5-01b1-486a-9502-1453420c1713','669287a0-3878-475d-b6fc-c86f10a97505'),
  ('f9041e56-a52d-40ca-9b83-70b507a7e00f','ee72880d-087a-48fc-ac3c-8ec23e91263d'),
  ('4c6f4461-44a5-4170-9ad6-4c93e55dffa3','faa19c31-7604-4a1e-a76c-4376f6ad2d68'),
  ('0bda0e15-23a6-401e-a8ff-bc55790e83aa','99bbb194-bf54-4dce-9146-4cd100b93bb1'),
  ('1ba4c490-5ca3-444d-800b-c06c0c1186c9','a9472dd2-59d4-49dd-9754-4dd40cd99f61'),
  ('ebd24728-9691-45b1-a53f-9fa6c5424d1b','ab69efc7-97de-4581-a7b3-f1b840a3ebcf'),
  ('eb6a98be-ba89-4cad-be86-431275107ad8','447acebd-255a-419d-96cf-13ef506610bd')
) as v(pid, did)
where p.id = v.pid::uuid and p.ai_decision_id is null;

update positions p
set setup_type = v.st, attribution_source = v.att
from (values
  ('719c0e93-24cd-4295-8f5b-ab1d1785230d','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('8dc18bc9-c8c6-41d7-b7cb-848d0ea8dd9c','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('ae9a587a-165a-415e-9e65-04a32ab9bc3d','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('46810c56-da29-43ac-b24f-4cdd11958c1b','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('a3f454df-7e08-4c66-867b-eaa48d2eaf69','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('873017e9-6858-4648-b472-bf7e238ce389','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('0d50922d-d342-40e2-b517-222f137fe5f4','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('5fc4f31e-6562-4a20-93ff-cb50ff911e0e','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('dcf2a004-dcfe-4f07-b141-1dd39cd2b525','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('621ca989-52d3-4c47-8fad-69555d7f6bc8','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('b29e4401-71c2-4137-a0c3-9c0c9b0d547b','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('68dce053-f4de-412d-b1bc-ea548fb0d860','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('f8f5493d-4a35-40be-8b51-43c5e8210a4b','EXTERNAL_SIGNAL','EXTERNAL_SIGNAL'),
  ('ba0d4e5e-aeaf-4b94-9a27-a6bfd8d39498','UNKNOWN','UNKNOWN'),
  ('ca35c061-89b9-440c-812a-29ce2c8f6819','UNKNOWN','UNKNOWN'),
  ('698975c4-a8a8-466b-a8a7-683065d769b4','UNKNOWN','UNKNOWN'),
  ('75374394-054d-4347-a957-219159a0c639','UNKNOWN','UNKNOWN'),
  ('8a8a8a84-853a-451a-a9ac-d4594e4836d8','UNKNOWN','UNKNOWN'),
  ('4e487e1e-03d3-46d1-9425-49b6951bc7d8','UNKNOWN','UNKNOWN'),
  ('e4408b29-2f5f-4081-807f-5919c61b6679','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('1d402758-318a-4672-843d-95fcb00ea2cc','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('9648f5a2-03c2-43c4-b8cf-7e9c7a1cefc3','UNKNOWN','UNKNOWN'),
  ('a39c2da7-bbb8-489d-b05e-0313cfb99e19','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('b43b24e5-03ae-4245-9342-f9cb94c37a86','UNKNOWN','UNKNOWN'),
  ('cacade7c-7fe3-4766-97f4-e6b511fdf499','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('d7acfc5f-4b64-4ea0-94d9-d9d316e370b1','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('9acc93b9-4e66-4b86-aeb9-f49ec7c28ec5','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('4b5feeae-b06f-4aa1-a109-9e21444d825d','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('d5d252b0-5fdf-43af-a266-aaff92cde173','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('ed468eaf-cfb7-4f22-89fb-4856e5e3afbf','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('3f85ecb7-a398-4354-adc1-27991178cbd0','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('453e3b39-00bc-4132-80de-5b6b7e57bf11','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('79e22b1e-37bf-4906-ab98-40e4b18cd437','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('3000b916-6e93-4991-95c6-bb9e51fb1a37','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('2dcfcc95-a809-4481-b904-5d9693229bce','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('2ebb98a9-136b-4ee9-b7f9-5d7c5f361164','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('a1fc6708-c386-4c11-9c54-7112c2c7c5e4','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('29d74824-8733-45b7-9847-15c67c32774a','MEAN_REVERSION','TEXT_DERIVED_PHRASE'),
  ('ffdd679f-7781-4173-bd17-d5e3c3b7d8a4','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('c8b272fe-80a3-4c6a-8ca2-72ca5ad60c65','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('6441535c-4c3d-4a30-ae02-f9111b2a3ba2','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('a248def3-10f1-4285-89de-e4cf877c8a2c','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('de4b0171-af2d-4976-bc95-a869cfcab359','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('eb2ba4b6-a58f-4383-83a0-b5980235fc36','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('d2a68e5b-7018-4368-b325-72388b66a81f','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('101bf62c-7157-4922-ab13-6bd453745bda','UNKNOWN','UNKNOWN'),
  ('4d76702c-3a8d-479e-9664-c6c6357929a0','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('a30b4ae0-a19e-4f00-b528-c4ccead5b6d6','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('da1a3f72-916c-4a14-af90-a73115e0c6dd','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('8f4b4489-ef6f-4d85-be6f-949e5b3f9fe3','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('1564208f-54a0-4481-b1c3-457fd44c617b','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('3bd990b1-9138-4075-8bcf-e4f4c5213682','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('0cb8c24b-1cb1-442f-bfec-3c413b04518b','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('e4e9aa21-89cb-4d4f-998f-145e6863b377','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('f6a7d556-2151-4878-8567-f8be0164e16b','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('933eb79f-b4bb-47bf-b477-c75b6349e7e1','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('1b3cb501-27fc-4f84-9cf8-c12998fcb047','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('3d5b3a98-70c3-487d-bc7d-5d6441064e0f','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('02b3c917-ce3c-4b13-b885-f4dc6787ea59','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('a4616fa5-01b1-486a-9502-1453420c1713','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('f9041e56-a52d-40ca-9b83-70b507a7e00f','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('4c6f4461-44a5-4170-9ad6-4c93e55dffa3','MOMENTUM_CONTINUATION','TEXT_DERIVED_EXACT'),
  ('0bda0e15-23a6-401e-a8ff-bc55790e83aa','MOMENTUM_CONTINUATION','TEXT_DERIVED_PHRASE'),
  ('1ba4c490-5ca3-444d-800b-c06c0c1186c9','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('ebd24728-9691-45b1-a53f-9fa6c5424d1b','MEAN_REVERSION','TEXT_DERIVED_EXACT'),
  ('eb6a98be-ba89-4cad-be86-431275107ad8','UNKNOWN','UNKNOWN')
) as v(pid, st, att)
where p.id = v.pid::uuid and p.setup_type is null;

commit;

-- DOĞRULAMA:
-- select attribution_source, count(*) from positions group by 1 order by 1;
-- select setup_type, count(*) from positions group by 1 order by 1;
--
-- GERİ ALMA:
-- update positions p set setup_type=b.old_setup_type,
--   attribution_source=b.old_attribution_source, ai_decision_id=b.old_ai_decision_id
--   from positions_attribution_backup_20260724 b where p.id=b.id;
