import { Template } from '../models/index.js';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "ddnlcnk4n",
  api_key: process.env.CLOUDINARY_API_KEY || "926369151961374",
  api_secret: process.env.CLOUDINARY_API_SECRET || "SSAWvSK-VltUMpkthHvHR7VTPU8"
});

const CONTENT_TYPES = {
  IMAGE: 'image',
  CAROUSEL: 'carousel',
  PDF: 'pdf',
  LOCATION: 'location'
};

const VALIDATION_PATTERNS = {
  image: /^data:image\/(jpeg|jpg|png|gif|webp);base64,/,
  pdf: /^data:application\/pdf;base64,/
};

const isValidBase64 = (base64, type = 'image') => {
  return VALIDATION_PATTERNS[type]?.test(base64);
};

const sanitizeFileName = (name) => {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
};

const createCloudinaryOptions = (name, type, isRaw = false) => {
  const timestamp = Date.now();
  const basePath = isRaw ? 'templates/pdfs' : 'templates/images';
  
  const baseOptions = {
    public_id: `${basePath}/${sanitizeFileName(name)}_${timestamp}`,
    access_mode: 'public'
  };

  if (isRaw) {
    return {
      ...baseOptions,
      resource_type: 'raw',
      format: 'pdf'
    };
  }

  return {
    ...baseOptions,
    resource_type: 'image',
    format: 'png',
    transformation: [
      { width: 1200, height: 800, crop: 'limit' },
      { quality: 'auto:good' }
    ]
  };
};

const uploadPdfToCDN = async (pdfBuffer, templateName) => {
  try {
    const base64String = pdfBuffer.toString('base64');
    const uploadData = `data:application/pdf;base64,${base64String}`;
    const options = createCloudinaryOptions(templateName, 'pdf', true);
    const result = await cloudinary.uploader.upload(uploadData, options);
    return result.secure_url;
  } catch (error) {
    throw new Error(`PDF upload failed: ${error.message}`);
  }
};

const uploadImageToCDN = async (data, name) => {
  try {
    let uploadData;
    if (typeof data === 'string' && isValidBase64(data, 'image')) {
      uploadData = data;
    } else if (Buffer.isBuffer(data)) {
      const base64String = data.toString('base64');
      uploadData = `data:image/jpeg;base64,${base64String}`;
    } else {
      throw new Error('Invalid image data format');
    }
    const options = createCloudinaryOptions(name, 'image');
    const result = await cloudinary.uploader.upload(uploadData, options);
    return result.secure_url;
  } catch (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }
};

const processImageContent = async (template, templateName) => {
  if (!template.image) return {};
  const { image } = template;
  if (typeof image === 'string' && image.startsWith('data:image/')) {
    return { image: await uploadImageToCDN(image, templateName) };
  }
  if (Buffer.isBuffer(image)) {
    return { image: await uploadImageToCDN(image, templateName) };
  }
  return { image };
};

const processCarouselContent = async (template, templateName) => {
  if (!template.carousel_images?.length) return {};
  const carousel_images = await Promise.all(
    template.carousel_images.map(async (img, index) => {
      const imageName = `${templateName}_${index}`;
      if (typeof img === 'string' && img.startsWith('data:image/')) {
        return await uploadImageToCDN(img, imageName);
      }
      if (Buffer.isBuffer(img)) {
        return await uploadImageToCDN(img, imageName);
      }
      return img;
    })
  );
  return { carousel_images };
};

const processPdfContent = async (template, templateName) => {
  if (!template.pdf_file) return {};
  let pdfBuffer;
  if (typeof template.pdf_file === 'string' && template.pdf_file.startsWith('data:application/pdf')) {
    const base64Data = template.pdf_file.replace(/^data:application\/pdf;base64,/, '');
    pdfBuffer = Buffer.from(base64Data, 'base64');
  } else if (Buffer.isBuffer(template.pdf_file)) {
    pdfBuffer = template.pdf_file;
  } else {
    throw new Error('Invalid PDF format');
  }

  const pdf_url = await uploadPdfToCDN(pdfBuffer, templateName);
  return { pdf_url };
};

const processLocationContent = (template) => {
  return template.location_link ? { location_link: template.location_link } : {};
};

const processTemplate = async (template) => {
  const { template_name, content_type, is_dynamic, placeholders } = template;

  if (!template_name?.trim()) throw new Error('Template name required');
  if (!content_type) throw new Error('Content type required');

  const newTemplate = {
    template_name: template_name.trim(),
    content_type: content_type,
    is_dynamic: Boolean(is_dynamic),
    placeholders: placeholders || {}
  };

  let contentData = {};
  switch (content_type) {
    case CONTENT_TYPES.IMAGE:
      contentData = await processImageContent(template, template_name);
      break;
    case CONTENT_TYPES.CAROUSEL:
      contentData = await processCarouselContent(template, template_name);
      break;
    case CONTENT_TYPES.PDF:
      contentData = await processPdfContent(template, template_name);
      break;
    case CONTENT_TYPES.LOCATION:
      contentData = processLocationContent(template);
      break;
    default:
      throw new Error(`Unsupported content type: ${content_type}`);
  }

  return { ...newTemplate, ...contentData };
};

// ------------------ Controller Methods ------------------

export const createTemplates = async (req, res) => {
  try {
    const {templatesWithContent}=req.body
    const templates = Array.isArray(templatesWithContent) ? templatesWithContent : [templatesWithContent];
    if (!templates.length) return res.status(400).json({ success: false, message: 'No templates provided' });

    const processed = [];
    const errors = [];
   console.log(templates)
    for (let i = 0; i < templates.length; i++) {
      try {
        const templateData = await processTemplate(templates[i]);
        processed.push(templateData);
      } catch (err) {
        errors.push(`Template ${i + 1}: ${err.message}`);
      }
    }

    if (errors.length && !processed.length) {
      return res.status(400).json({ success: false, message: 'All templates failed', errors });
    }

    const created = await Template.bulkCreate(processed);
    console.log(`Created ${created.length} template${created.length > 1 ? 's' : ''}`)
    res.status(201).json({
      success: true,
      message: `Created ${created.length} template${created.length > 1 ? 's' : ''}`,
      data: created,
      ...(errors.length && { warnings: errors })
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = await processTemplate(req.body);
    const [updatedCount, [updatedTemplate]] = await Template.update(updatedData, {
      where: { template_name:id },
      returning: true
    });

    if (!updatedCount) return res.status(404).json({ success: false, message: 'Template not found' });

    res.json({ success: true, message: 'Template updated', data: updatedTemplate });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed', error: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('deleted templete',id)
    const deleted = await Template.destroy({ where: { template_name:id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template deleted', id });
  } catch (error) {
    console.log('delete',error.message)
    res.status(500).json({ success: false, message: 'Delete failed', error: error.message });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await Template.findAll({where:{template_name:id}});
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Fetch failed', error: error.message });
  }
};

export const getAllTemplates = async (req, res) => {
  try {
    const { page = 1, limit = 10, contentType, search } = req.query;
    const where = {};
    if (contentType) where.content_type = contentType;
    if (search) where.template_name = { [Op.iLike]: `%${search}%` };

    const offset = (page - 1) * limit;

    const { rows, count } = await Template.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit),
        hasNextPage: offset + rows.length < count,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.log(error.message)
    res.status(500).json({ success: false, message: 'Fetch failed', error: error.message });
  }
};

export const getPdfUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findByPk(id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    if (template.content_type !== CONTENT_TYPES.PDF || !template.pdf_url) {
      return res.status(400).json({ success: false, message: 'Invalid PDF template' });
    }
    res.json({
      success: true,
      data: {
        templateId: id,
        templateName: template.template_name,
        pdfUrl: template.pdf_url,
        contentType: template.content_type
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get PDF URL', error: error.message });
  }
};

export const getTemplatesByType = async (req, res) => {
  try {
    const { type } = req.params;
    if (!Object.values(CONTENT_TYPES).includes(type)) {
      return res.status(400).json({ success: false, message: `Invalid content type` });
    }
    const templates = await Template.findAll({ where: { content_type: type }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: templates, count: templates.length, contentType: type });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Fetch failed', error: error.message });
  }
};
