'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Plus, Edit, Trash2, Megaphone, Save, X } from 'lucide-react'

interface Announcement {
  _id: string
  title: string
  content: string
  type: 'announcement' | 'advertisement'
  isActive: boolean
  imageUrl?: string
  createdAt: string
  updatedAt?: string
}

export default function AnnouncementManagement() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showImageBrowser, setShowImageBrowser] = useState(false)
  const [availableImages, setAvailableImages] = useState<any[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('')
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement' as 'announcement' | 'advertisement',
    imageUrl: ''
  })

  const fetchAvailableImages = async () => {
    try {
      setLoadingImages(true)
      const response = await fetch('/api/admin/announcements/list-images')
      if (response.ok) {
        const data = await response.json()
        setAvailableImages(data.images || [])
      } else {
        console.error('Failed to fetch available images')
        setAvailableImages([])
      }
    } catch (error) {
      console.error('Error fetching available images:', error)
      setAvailableImages([])
    } finally {
      setLoadingImages(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/signin')
      return
    }
    
    fetchAnnouncements()
  }, [session, status, router])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/announcements')
      if (response.ok) {
        const data = await response.json()
        setAnnouncements(data.announcements || [])
      } else {
        console.error('Failed to fetch announcements')
      }
    } catch (error) {
      console.error('Error fetching announcements:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }
      
      // Validate file size (1MB for maximum compatibility)
      if (file.size > 1 * 1024 * 1024) {
        alert('File size must be less than 1MB')
        return
      }

      setSelectedFile(file)
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadImageBase64 = async () => {
    if (!selectedFile) return null

    try {
      console.log('🔄 Trying base64 upload method...')
      
      // Convert file to base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(selectedFile)
      })

      const imageData = await base64Promise
      
      const response = await fetch('/api/admin/announcements/upload-base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageData,
          fileName: selectedFile.name,
          fileType: selectedFile.type
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Base64 upload successful:', result)
        return result.imageUrl
      } else {
        const error = await response.json()
        console.error('❌ Base64 upload failed:', error)
        throw new Error(error.error)
      }
    } catch (error) {
      console.error('❌ Base64 upload exception:', error)
      throw error
    }
  }

  const uploadImage = async () => {
    if (!selectedFile) return null

    try {
      setUploading(true)
      console.log('🚀 Starting upload request...')
      console.log('📎 File details:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      })

      // First try multipart upload
      try {
        const formData = new FormData()
        formData.append('image', selectedFile)

        const response = await fetch('/api/admin/announcements/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        console.log('📡 Response status:', response.status)

        if (response.ok) {
          const result = await response.json()
          console.log('✅ Multipart upload successful:', result)
          return result.imageUrl
        } else if (response.status === 413) {
          console.log('⚠️ 413 error, trying base64 upload...')
          return await uploadImageBase64()
        } else {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json()
            throw new Error(error.error)
          } else {
            throw new Error('Server returned HTML instead of JSON')
          }
        }
      } catch (fetchError) {
        console.log('⚠️ Multipart upload failed, trying base64...', fetchError.message)
        return await uploadImageBase64()
      }
    } catch (error) {
      console.error('❌ All upload methods failed:', error)
      alert(`Error uploading image: ${error.message}`)
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('Please fill in all required fields')
      return
    }

    try {
      setSaving('new')
      
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await fetchAnnouncements()
        setCreating(false)
        setFormData({ title: '', content: '', type: 'announcement', imageUrl: '' })
        setSelectedImageUrl('')
        setImagePreview(null)
        setShowImageBrowser(false)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating announcement:', error)
      alert('Error creating announcement')
    } finally {
      setSaving(null)
    }
  }

  const handleUpdate = async (announcementId: string, updates: Partial<Announcement>) => {
    try {
      setSaving(announcementId)
      const response = await fetch('/api/admin/announcements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId, ...updates })
      })

      if (response.ok) {
        await fetchAnnouncements()
        setEditing(null)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating announcement:', error)
      alert('Error updating announcement')
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (announcementId: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return

    try {
      setSaving(announcementId)
      const response = await fetch(`/api/admin/announcements?announcementId=${announcementId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchAnnouncements()
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting announcement:', error)
      alert('Error deleting announcement')
    } finally {
      setSaving(null)
    }
  }

  const toggleActive = async (announcementId: string, isActive: boolean) => {
    await handleUpdate(announcementId, { isActive })
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading announcement management...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Announcement Management</h1>
        <p className="text-gray-600">Manage announcements and advertisements for the signin page</p>
      </div>

      {/* Create New Announcement */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-600" />
                {creating ? 'Create New Announcement' : 'Quick Actions'}
              </CardTitle>
              <CardDescription>
                {creating ? 'Add a new announcement or advertisement' : 'Manage announcements for the signin page'}
              </CardDescription>
            </div>
            {!creating && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Announcement
              </Button>
            )}
          </div>
        </CardHeader>
        {creating && (
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter announcement title"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'announcement' | 'advertisement' }))}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="advertisement">Advertisement</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="content">Content *</Label>
                <textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter announcement content"
                  rows={4}
                  required
                  className="w-full p-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              {/* Image Selection */}
              <div>
                <Label htmlFor="image">Image (Optional)</Label>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImageBrowser(!showImageBrowser)
                        if (!showImageBrowser) {
                          fetchAvailableImages()
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                    >
                      {showImageBrowser ? 'Hide' : 'Browse'} Available Images
                    </button>
                    <input
                      type="text"
                      placeholder="Or enter image URL manually"
                      value={selectedImageUrl}
                      onChange={(e) => {
                        setSelectedImageUrl(e.target.value)
                        setFormData(prev => ({ ...prev, imageUrl: e.target.value }))
                        if (e.target.value) {
                          setImagePreview(e.target.value)
                        }
                      }}
                      className="flex-1 p-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  
                  {showImageBrowser && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="mb-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Available Images</h4>
                        <p className="text-xs text-gray-500 mb-3">
                          To add new images, upload them via SCP to: <code className="bg-gray-100 px-1 rounded">public/uploads/announcements/</code>
                        </p>
                      </div>
                      
                      {loadingImages ? (
                        <div className="text-center py-4">
                          <div className="text-sm text-gray-500">Loading images...</div>
                        </div>
                      ) : availableImages.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto">
                          {availableImages.map((image, index) => (
                            <div
                              key={index}
                              className={`border rounded-lg p-2 cursor-pointer hover:bg-white transition-colors ${
                                selectedImageUrl === image.url ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                              }`}
                              onClick={() => {
                                setSelectedImageUrl(image.url)
                                setFormData(prev => ({ ...prev, imageUrl: image.url }))
                                setImagePreview(image.url)
                              }}
                            >
                              <img
                                src={image.url}
                                alt={image.filename}
                                className="w-full h-16 object-cover rounded border border-gray-100"
                                onError={(e) => {
                                  e.currentTarget.src = '/placeholder-image.png'
                                }}
                              />
                              <div className="mt-1">
                                <p className="text-xs font-medium text-gray-700 truncate" title={image.filename}>
                                  {image.filename}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {(image.size / 1024).toFixed(1)}KB
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <div className="text-sm text-gray-500 mb-2">No images found</div>
                          <div className="text-xs text-gray-400">
                            Upload image files to <code className="bg-gray-100 px-1 rounded">public/uploads/announcements/</code> directory
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {imagePreview && (
                    <div className="mt-2">
                      <div className="text-sm text-gray-600 mb-1">Preview:</div>
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImageUrl('')
                          setImagePreview(null)
                          setFormData(prev => ({ ...prev, imageUrl: '' }))
                        }}
                        className="mt-1 text-xs text-red-600 hover:text-red-700"
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={saving === 'new'}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving === 'new' ? 'Creating...' : 'Create Announcement'}
                </Button>
                <Button variant="outline" onClick={() => {
                  setCreating(false)
                  setFormData({ title: '', content: '', type: 'announcement', imageUrl: '' })
                  setSelectedImageUrl('')
                  setImagePreview(null)
                  setShowImageBrowser(false)
                }}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Announcements List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Announcements ({announcements.length})</h2>
        
        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Megaphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No announcements yet</h3>
              <p className="text-gray-500">Create your first announcement to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {announcements.map((announcement) => (
              <Card key={announcement._id} className={`${!announcement.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                  {editing === announcement._id ? (
                    <EditForm 
                      announcement={announcement}
                      onSave={(updates) => handleUpdate(announcement._id, updates)}
                      onCancel={() => setEditing(null)}
                      saving={saving === announcement._id}
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {announcement.imageUrl && (
                            <div className="mb-3">
                              <img 
                                src={announcement.imageUrl} 
                                alt={announcement.title}
                                className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{announcement.title}</h3>
                            <Badge variant={announcement.type === 'announcement' ? 'default' : 'secondary'}>
                              {announcement.type}
                            </Badge>
                            {!announcement.isActive && (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-gray-600 mb-3">{announcement.content}</p>
                          <div className="text-sm text-gray-400">
                            Created: {new Date(announcement.createdAt).toLocaleString()}
                            {announcement.updatedAt && announcement.updatedAt !== announcement.createdAt && (
                              <span className="ml-4">
                                Updated: {new Date(announcement.updatedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <div className="flex items-center space-x-2">
                            <Label htmlFor={`active-${announcement._id}`} className="text-sm">
                              {announcement.isActive ? 'Active' : 'Inactive'}
                            </Label>
                            <Switch
                              id={`active-${announcement._id}`}
                              checked={announcement.isActive}
                              onCheckedChange={(checked) => toggleActive(announcement._id, checked)}
                              disabled={saving === announcement._id}
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(announcement._id)}
                            disabled={saving === announcement._id}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(announcement._id)}
                            disabled={saving === announcement._id}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Edit Form Component
function EditForm({ 
  announcement, 
  onSave, 
  onCancel, 
  saving 
}: { 
  announcement: Announcement
  onSave: (updates: Partial<Announcement>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState(announcement.title)
  const [content, setContent] = useState(announcement.content)
  const [type, setType] = useState(announcement.type)

  const handleSave = () => {
    if (!title.trim() || !content.trim()) {
      alert('Please fill in all required fields')
      return
    }
    onSave({ title, content, type })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="edit-title">Title *</Label>
          <Input
            id="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter announcement title"
          />
        </div>
        <div>
          <Label htmlFor="edit-type">Type</Label>
          <select
            id="edit-type"
            value={type}
            onChange={(e) => setType(e.target.value as 'announcement' | 'advertisement')}
            className="w-full p-2 border border-gray-300 rounded-md"
          >
            <option value="announcement">Announcement</option>
            <option value="advertisement">Advertisement</option>
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="edit-content">Content *</Label>
        <textarea
          id="edit-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter announcement content"
          rows={4}
          className="w-full p-2 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  )
}